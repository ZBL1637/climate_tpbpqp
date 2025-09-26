param(
    [int]$Port = 8080,
    [string]$Root = ".",
    [string]$RemoteOrigin = "https://climate-tpbpqp.manus.space"
)

# ========================= Helper Functions =========================

function Get-ContentType {
    <#
    .SYNOPSIS
      根据文件扩展名返回合适的 Content-Type。
    .PARAMETER Path
      本地文件路径，用于判断扩展名。
    .OUTPUTS
      [string] 返回 MIME 类型。
    #>
    param([Parameter(Mandatory)][string]$Path)

    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    switch ($ext) {
        ".html" { return "text/html; charset=utf-8" }
        ".htm"  { return "text/html; charset=utf-8" }
        ".js"   { return "text/javascript; charset=utf-8" }
        ".mjs"  { return "text/javascript; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".svg"  { return "image/svg+xml" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".gif"  { return "image/gif" }
        ".ico"  { return "image/x-icon" }
        ".webp" { return "image/webp" }
        ".woff" { return "font/woff" }
        ".woff2"{ return "font/woff2" }
        default  { return "application/octet-stream" }
    }
}

function Send-LocalFile {
    <#
    .SYNOPSIS
      将本地静态文件写入到 HTTP 响应。
    .PARAMETER Context
      HttpListenerContext 对象。
    .PARAMETER FilePath
      要发送的本地文件路径。
    #>
    param(
        [Parameter(Mandatory)]$Context,
        [Parameter(Mandatory)][string]$FilePath
    )

    try {
        $bytes = [System.IO.File]::ReadAllBytes($FilePath)
        $resp = $Context.Response
        $resp.StatusCode = 200
        $resp.ContentType = Get-ContentType -Path $FilePath
        $resp.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        $resp.Headers["Pragma"] = "no-cache"
        $resp.Headers["Expires"] = "0"
        $resp.ContentLength64 = $bytes.LongLength
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.OutputStream.Flush()
    } catch {
        Write-Log -Level Error -Message "Send-LocalFile error: $($_.Exception.Message)"
        Send-Text -Context $Context -StatusCode 500 -Text "Internal Server Error"
    } finally {
        $Context.Response.OutputStream.Close()
    }
}

function Send-Text {
    <#
    .SYNOPSIS
      发送纯文本到响应。
    .PARAMETER Context
      HttpListenerContext 对象。
    .PARAMETER StatusCode
      HTTP 状态码。
    .PARAMETER Text
      文本内容。
    #>
    param(
        [Parameter(Mandatory)]$Context,
        [int]$StatusCode = 200,
        [string]$Text = ""
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $resp = $Context.Response
    $resp.StatusCode = $StatusCode
    $resp.ContentType = "text/plain; charset=utf-8"
    $resp.ContentLength64 = $bytes.LongLength
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.OutputStream.Flush()
    $resp.OutputStream.Close()
}

function Proxy-RemoteRequest {
    <#
    .SYNOPSIS
      将请求代理转发到远程站点（避免浏览器 CORS 问题）。
    .PARAMETER Context
      HttpListenerContext 对象。
    .PARAMETER RemoteUrl
      要请求的远程完整 URL，例如 https://example.com/assets/app.js
    #>
    param(
        [Parameter(Mandatory)]$Context,
        [Parameter(Mandatory)][string]$RemoteUrl
    )

    try {
        $handler = New-Object System.Net.Http.HttpClientHandler
        $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate -bor [System.Net.DecompressionMethods]::Brotli
        $client = New-Object System.Net.Http.HttpClient($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(30)
        $client.DefaultRequestHeaders.UserAgent.ParseAdd("StaticProxy/1.0 (+Windows PowerShell)")
        $client.DefaultRequestHeaders.Accept.ParseAdd("*/*")

        $response = $client.GetAsync($RemoteUrl).GetAwaiter().GetResult()
        $content = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()

        $ctxResp = $Context.Response
        $ctxResp.StatusCode = [int]$response.StatusCode

        # 尝试透传远程的 Content-Type
        $contentType = $response.Content.Headers.ContentType
        if ($contentType) {
            $ctxResp.ContentType = $contentType.ToString()
        } else {
            # 兜底：根据扩展名判断
            $uriObj = [System.Uri]$RemoteUrl
            $ctxResp.ContentType = Get-ContentType -Path $uriObj.AbsolutePath
        }

        # 缓存头尽量与远程一致
        foreach ($h in $response.Headers) {
            $name = $h.Key
            $value = ($h.Value -join ", ")
            switch -Regex ($name) {
                "^Transfer-Encoding$|^Connection$|^Keep-Alive$|^Content-Encoding$|^Content-Length$|^Set-Cookie$" { continue }
                default { $ctxResp.Headers[$name] = $value }
            }
        }
        foreach ($h in $response.Content.Headers) {
            $name = $h.Key
            $value = ($h.Value -join ", ")
            switch -Regex ($name) {
                "^Content-Type$|^Content-Length$|^Content-Encoding$" { continue }
                default { $ctxResp.Headers[$name] = $value }
            }
        }

        $ctxResp.ContentLength64 = $content.LongLength
        $ctxResp.OutputStream.Write($content, 0, $content.Length)
        $ctxResp.OutputStream.Flush()
    } catch {
        Write-Log -Level Error -Message "Proxy error: $RemoteUrl => $($_.Exception.Message)"
        Send-Text -Context $Context -StatusCode 502 -Text "Bad Gateway"
    } finally {
        $Context.Response.OutputStream.Close()
    }
}

function Write-Log {
    <#
    .SYNOPSIS
      简单日志输出。
    .PARAMETER Level
      日志级别：Info/Warn/Error。
    .PARAMETER Message
      日志消息。
    #>
    param(
        [ValidateSet('Info','Warn','Error')][string]$Level = 'Info',
        [string]$Message
    )
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Write-Host "[$ts][$Level] $Message"
}

function Start-StaticServer {
    <#
    .SYNOPSIS
      启动一个支持本地静态文件与远程代理回退的 HTTP 服务器。
    .DESCRIPTION
      - 对根路径 / 或任意路径，优先查找本地文件并返回。
      - 若本地不存在，则代理到 $RemoteOrigin + RawUrl，避免 CORS，确保与线上站点一致。
    .PARAMETER Port
      监听端口。
    .PARAMETER Root
      静态根目录。
    .PARAMETER RemoteOrigin
      远程站点（用于代理回退）。
    #>
    param(
        [int]$Port,
        [string]$Root,
        [string]$RemoteOrigin
    )

    $rootFull = [System.IO.Path]::GetFullPath($Root)
    if (-not (Test-Path $rootFull)) {
        throw "Root directory not found: $rootFull"
    }

    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    Write-Log -Message "Server listening at $prefix"
    Write-Host $prefix  # 供外部工具捕获预览 URL
    Write-Log -Message "Root: $rootFull"
    Write-Log -Message "Remote origin (fallback proxy): $RemoteOrigin"

    try {
        while ($true) {
            $context = $listener.GetContext()
            try {
                $req = $context.Request
                $rawUrl = $req.RawUrl
                $absPath = $req.Url.AbsolutePath

                # 将 URL 映射到本地文件
                if ($absPath -eq "/") {
                    $localPath = Join-Path $rootFull "index.html"
                } else {
                    $rel = $absPath.TrimStart('/')
                    $localPath = Join-Path $rootFull $rel
                }

                # 规范化并阻止目录穿越
                $localFull = [System.IO.Path]::GetFullPath($localPath)
                if (-not $localFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                    Send-Text -Context $context -StatusCode 403 -Text "Forbidden"
                    continue
                }

                if (Test-Path $localFull -PathType Leaf) {
                    Send-LocalFile -Context $context -FilePath $localFull
                } else {
                    $remoteUrl = ($RemoteOrigin.TrimEnd('/')) + $rawUrl
                    Proxy-RemoteRequest -Context $context -RemoteUrl $remoteUrl
                }
            } catch {
                Send-Text -Context $context -StatusCode 500 -Text "Internal Server Error"
            }
        }
    } finally {
        $listener.Stop()
        $listener.Close()
    }
}

# ========================= Entry =========================
try {
    Start-StaticServer -Port $Port -Root $Root -RemoteOrigin $RemoteOrigin
} catch {
    Write-Log -Level Error -Message $_.Exception.Message
    throw
}