# ai-chat-and-then-show

自然语言分子搜索。模型推荐已知化学分子并解释匹配原因，PubChem 提供结构和计算属性。点击候选可查看独立详情、二维图和可拖动旋转及缩放的三维构象。常规搜索需要兼容 OpenAI Chat Completions 的模型 API，内置示例可直接试用。

## 本地体验

建议使用 Python 3.10 或更新版本。在项目目录运行以下命令。

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
MOLECULE_SEARCH_DEMO=1 python -m flask --app app run --port 8002
```

打开 [分子探索](http://127.0.0.1:8002/)，选择一个示例并点击「搜索分子」。点开候选后，在详情页切换到「3D」。试用模式使用内置匹配说明和随项目提供的 PubChem 记录。

## 接入模型 API

将 `.env.example` 复制到 `.env`，在本地填入密钥。部署时在服务端环境变量中填写同样的配置。

| 环境变量 | 用途 |
| --- | --- |
| `MOLECULE_AI_API_KEY` | 模型 API 密钥，默认 OpenAI 地址也支持 `OPENAI_API_KEY`。 |
| `MOLECULE_AI_BASE_URL` | 默认 `https://api.openai.com/v1`。接口须支持 `/chat/completions`、JSON 对象模式和 `max_completion_tokens`。 |
| `MOLECULE_AI_MODEL` | 默认 `gpt-4.1-mini`。 |
| `MOLECULE_SEARCH_DEMO` | 设为 `1` 使用内置示例，设为 `0` 使用真实模型 API。 |

```sh
set -a
. ./.env
set +a
python -m gunicorn app:app --bind 127.0.0.1:8002 --timeout 60
```

二维结构由 RDKit 渲染。三维读取 PubChem 构象，缺失时尝试匹配 NIST Chemistry WebBook 的同一分子记录。计算属性由 PubChem 提供。RDKit 和 Three.js 的授权文本位于 [assets](assets/)。
