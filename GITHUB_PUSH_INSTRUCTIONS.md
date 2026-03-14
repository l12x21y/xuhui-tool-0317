# 推送到 GitHub（快速说明）

下面给两种常用方式：用 `gh`（GitHub CLI，一行完成）和手动方式（在 web 上新建仓库）。执行这些命令会在 GitHub 上生成仓库链接 `https://github.com/<你的用户名>/<仓库名>`。

## 方法 A：使用 GitHub CLI（推荐，最快）
前提：已安装并登录 `gh`，如果没有，请先安装并执行 `gh auth login`。

在项目根目录执行：

```bash
# 用仓库名替换 my-repo-name
gh repo create my-repo-name --public --source=. --remote=origin --push
```

命令说明：
- `--source=.` 会把当前目录的内容作为仓库内容。
- `--remote=origin --push` 会自动创建 `origin` 并推送当前分支。

完成后，`gh` 会输出仓库地址，你可以直接打开该 URL。

## 方法 B：手动（在 GitHub 网站上创建并推送）
1. 在 GitHub 网站上点击 "New repository"，填写仓库名（例如 `xuhui-grid-heat-simulator`），选择 Public 或 Private，然后创建。
2. 在本地项目根目录运行：

```bash
git init
git add .
git commit -m "Initial commit"
# 用 GitHub 页面提供的 repo URL 替换下面的 <URL>
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
# 确保分支为 main（或将 master 改为 main）
git branch -M main
git push -u origin main
```

推送成功后，仓库链接为 `https://github.com/<你的用户名>/<仓库名>`。

## 常见问题
- 若提示凭证错误，请使用 `gh auth login` 登录或在本地配置 SSH key 并在 GitHub 绑定。
- 若要把大型数据文件公开供前端使用，请把它们放到 `public/`（例如 `public/road/`），然后提交并推送。

需要我把 `road/` 下的数据复制到 `public/road/`（并更新 fetch 路径）吗？或者你想我创建一个空的 `.gitignore`（已存在）和这个说明文件到仓库（我已创建），现在你可以运行上面的命令来推送并得到链接。