# Codex Changes

同步自 `Image_Gen_change` 的 Python CLI 加固修改。

## 变更内容

- 在读取 `result.data` 前增加响应校验。
- 如果图像 API 返回 `error`，现在会直接报出真实错误。
- 如果响应里没有图像数据，会输出脱敏后的原始响应，便于排查。
- 脱敏 `b64_json`，避免把图片 base64 打到控制台。
- 同步应用于生成、批量生成和编辑流程。

## 建议提交信息

```text
Handle empty image API responses gracefully
```
