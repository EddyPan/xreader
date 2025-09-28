# 同步 API 文档

本文档概述了用于将阅读进度和书籍内容同步到远程服务器的 API。

## 身份验证

该 API 使用简单的基于令牌的身份验证。客户端在请求时，必须在 `Authorization` HTTP头中包含一个Bearer Token。

```
Authorization: Bearer <你的令牌>
```

服务器将验证此令牌以授权请求。如果令牌无效或缺失，服务器将返回 `401 Unauthorized` 错误。

## 端点

### `GET /health`

此端点用于检查同步服务器的健康状况，确保服务器正在运行且客户端可以访问。

**使用场景:**
- 在客户端保存同步设置时，用于验证同步URL的有效性。

**Curl 示例:**
```bash
curl -X GET https://your-sync-server.com/health
```

**响应:**

*   **200 OK:** 服务器健康。

    ```json
    {
      "status": "ok"
    }
    ```

*   **500 Internal Server Error:** 服务器遇到内部错误。

    ```json
    {
      "status": "error"
    }
    ```

### `POST /book`

此端点用于在首次同步时上传整本书籍的内容。

**使用场景:**
- 当用户对一本书籍首次启用同步时，客户端会调用此接口将书籍的全部文本内容上传到服务器。

**请求正文:**

```json
{
  "bookId": "string",
  "content": "string"
}
```

*   `bookId` (string, 必填): 书籍的唯一标识符 (例如，文件名)。
*   `content` (string, 必填): 书籍的全部文本内容。

**Curl 示例:**
```bash
curl -X POST https://your-sync-server.com/book \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <你的令牌>" \
     -d '{"bookId": "example-book.txt", "content": "这是书籍的全部内容..."}'
```

**响应:**

*   **200 OK:** 书籍已成功上传。

    ```json
    {
      "status": "success"
    }
    ```

*   **400 Bad Request:** 请求正文无效。
*   **401 Unauthorized:** 身份验证令牌丢失或无效。
*   **500 Internal Server Error:** 服务器上发生错误。

### `POST /sync`

此端点用于更新书籍的阅读进度。

**使用场景:**
- 在阅读过程中，当用户的阅读进度发生变化时，客户端会调用此接口来保存最新的页码和段落索引。

**请求正文：**

```json
{
  "bookId": "string",
  "progress": {
    "page": "number",
    "paraIndex": "number"
  }
}
```

*   `bookId` (string, 必填): 书籍的唯一标识符 (例如，文件名)。
*   `progress` (object, 必填): 阅读进度对象。
    *   `page` (number, 必填): 当前所在的页码。
    *   `paraIndex` (number, 必填): 当前所在段落的索引。

**Curl 示例:**
```bash
curl -X POST https://your-sync-server.com/sync \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <你的令牌>" \
     -d '{"bookId": "example-book.txt", "progress": {"page": 10, "paraIndex": 150}}'
```

**响应:**

*   **200 OK:** 进度已成功更新。

    ```json
    {
      "status": "success"
    }
    ```

*   **400 Bad Request:** 请求正文无效。
*   **401 Unauthorized:** 身份验证令牌丢失或无效。
*   **500 Internal Server Error:** 服务器上发生错误。

### `GET /sync/{bookId}`

此端点用于获取指定书籍的最新阅读进度。

**使用场景:**
- 当用户在新的设备上打开一本书时，客户端可以调用此接口来获取云端同步的最新进度，并从该位置继续阅读。

**URL 参数:**
*   `bookId` (string, 必填): 书籍的唯一标识符。

**Curl 示例:**
```bash
curl -X GET https://your-sync-server.com/sync/example-book.txt \
     -H "Authorization: Bearer <你的令牌>"
```

**响应:**

*   **200 OK:** 成功获取进度。

    ```json
    {
      "bookId": "example-book.txt",
      "progress": {
        "page": 10,
        "paraIndex": 150
      }
    }
    ```

*   **401 Unauthorized:** 身份验证令牌丢失或无效。
*   **404 Not Found:** 未找到该书籍的阅读进度。
*   **500 Internal Server Error:** 服务器上发生错误。

## 性能和流量注意事项

为尽量减少对性能的影响并减少网络流量，应在客户端实施以下策略：

*   **去抖动 (Debouncing):** 在同步阅读进度时，客户端应使用去抖动机制来避免在短时间内（例如，快速翻页时）发送大量请求。建议使用 2-3 秒的去抖动延迟，即在用户停止操作一段时间后再发送同步请求。
*   **批处理 (未来考虑):** 为了进一步优化，客户端可以将多个进度更新（例如，来自不同书籍的更新）批处理到单个请求中。这将需要一个更复杂的端点来处理一系列的进度更新，但这可以显著减少HTTP请求的开销。
