# 在线课件控制台（基于 Ant Design Pro）

PPTist 管理控制台，提供课件管理、模板管理等可视化操作界面。

## 技术栈

- **框架**: UmiJS Max 4.x
- **UI 库**: Ant Design 5.x + Pro Components 2.x
- **语言**: TypeScript
- **状态管理**: UmiJS Model
- **测试**: Jest
- **代码规范**: ESLint + Prettier
- **Git Hook**: Husky + lint-staged

## 项目结构

```
console/
├── config/               # 配置文件
│   ├── config.ts         # UmiJS 主配置
│   ├── routes.ts         # 路由配置
│   ├── proxy.ts          # 开发代理配置
│   └── defaultSettings.ts # 布局默认设置
├── src/
│   ├── pages/            # 页面组件
│   │   ├── Home/         # 首页
│   │   ├── Ppt/          # 课件管理
│   │   ├── MyPpt/        # 我的课件
│   │   ├── Tmpl/         # 模板管理
│   │   └── MyTmpl/       # 我的模板
│   ├── services/         # API 服务
│   │   ├── pptonline/    # 课件服务接口
│   │   ├── pptonline-base/ # OpenAPI 生成接口
│   │   ├── ucenter/      # 用户中心接口
│   │   └── doc/          # 文档服务接口
│   ├── components/       # 公共组件
│   ├── utils/            # 工具函数
│   ├── enum/             # 枚举定义
│   └── locales/          # 国际化
└── mock/                 # Mock 数据
```

## 功能模块

### 首页 (`/home`)
- 欢迎页面，展示平台信息

### 课件管理 (`/ppt/list`)
- 查看所有课件（管理员视图）
- 新建空白课件
- 从 PPTX 文件导入课件
- 预览课件
- 编辑课件幻灯片
- 删除课件

### 我的课件 (`/my-ppt/list`)
- 查看个人课件列表
- 课件的增删改查
- 预览和编辑课件

### 模板管理 (`/tmpl/list`)
- 查看所有模板（内置、平台、用户模板）
- 新建/编辑模板（标题、类型、封面、描述、尺寸、主题、幻灯片等）
- 导入/导出模板 JSON
- 预览和编辑模板幻灯片
- 启用/禁用模板
- 查看 AI 提示词示例

### 我的模板 (`/my-tmpl/list`)
- 查看个人模板列表
- 个人模板的增删改查

## 快速开始

### 环境要求
- Node.js >= 18
- pnpm

### 安装依赖
```bash
pnpm install
```

### 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置 API 服务地址等
```

### 启动服务
```bash
# 开发模式
pnpm dev

# 指定环境启动
pnpm start:dev    # 开发环境
pnpm start:test   # 测试环境
pnpm start:pre    # 预发环境
```

### 构建
```bash
# 生产构建
pnpm build

# 分析构建产物
pnpm analyze

# 预览构建结果
pnpm preview
```

### 代码检查
```bash
# 运行所有检查
pnpm lint

# 格式化代码
pnpm prettier

# 修复代码问题
pnpm lint:fix
```

### 测试
```bash
# 运行测试
pnpm test

# 生成覆盖率报告
pnpm test:coverage

# 更新快照
pnpm test:update
```

## 开发说明

### 代理配置
开发环境下通过 `config/proxy.ts` 配置代理，将请求转发到后端服务：
- 用户中心: `http://localhost:12001`
- 课件服务: `http://localhost:12005`
- 文档服务: `http://localhost:12004`
- 课件平台 (iframe): `http://localhost:15173`

### OpenAPI 代码生成
项目配置了 OpenAPI 代码生成，可从后端 Swagger 文档自动生成类型定义和 API 调用代码：
```bash
pnpm openapi
```

### 微前端支持
项目支持通过 wujie 微前端框架嵌入到其他应用中。

## 部署
```bash
# 构建并部署到 GitHub Pages
pnpm deploy
```
