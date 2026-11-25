# ai-chat-and-then-show 2.0

尝试使用AI模型思考学生想要搜索什么，集成化专门性AI工具

自然语言分子搜索。模型推荐已知化学分子并解释匹配原因，PubChem 提供结构和计算属性。首页展示匹配结果和二维缩略图。点击候选进入详情页，可以查看三维构象和计算属性。常规搜索需要兼容 OpenAI Chat Completions 的模型 API，课堂示例无需密钥。

## 本地体验

建议使用 Python 3.10 或更新版本。在项目目录运行以下命令。

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
MOLECULE_SEARCH_DEMO=1 python -m flask --app app run --port 8002
```

Windows PowerShell 可以使用以下命令。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install Flask
$env:MOLECULE_SEARCH_DEMO = '1'
.\.venv\Scripts\python.exe -m flask --app app run --port 8002
```

打开 [分子探索](http://127.0.0.1:8002/)，试试「显示水分子」或「找含苯环和羟基的小分子」。课堂示例读取随项目打包的结构记录。

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

页面通过 `POST /api/molecule-search` 提交 JSON 描述，例如 `{"query":"哪些有机酸容易溶于水？"}`。服务端使用上面的环境变量调用模型。开发服务默认示例端口为 `8002`，可通过启动命令中的端口参数调整。

## 结构与许可

二维结构由 RDKit 渲染。在线搜索优先使用 PubChem 构象，缺失时尝试匹配 NIST Chemistry WebBook 的同一分子记录。计算属性由 PubChem 提供。

三维部分改编自 Shihab Ahmed 的 [Molecule Viewer](https://github.com/sahmed73/molecule-viewer)，支持球棍、棍状和空间填充模型。自动旋转有独立的速率控件，可一键回到 1×。旋转动画可设起止角、单向或往返以及时长，预览结束或停止后恢复原视角。课堂示例中的水和甲烷使用其仓库中的 RDKit 计算构象。相关授权见 [Molecule Viewer 的 MIT 许可证](assets/LICENSE-Molecule-Viewer.txt)和 [3Dmol.js 的 BSD 许可证](assets/LICENSE-3Dmol.txt)。其余依赖授权见 [assets](assets/)。
