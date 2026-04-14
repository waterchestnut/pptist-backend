# pptist-backend

PPTist 在线演示文稿后端服务，为 [pptist-frontend](https://github.com/pptist/pptist) 提供完整的服务端支持，包含 PPT JSON 格式存储、AI 生成 PPT 后端接口、控制台管理等功能。

## 项目结构

```
pptist-backend/
├── api/              # 后端 API 服务（Node.js + Fastify）
├── console/          # 管理控制台（React + Ant Design Pro）
└── README.md
```

## 技术栈

### API 服务 (`api/`)
- **框架**: Node.js + Fastify
- **数据库**: MongoDB (Mongoose)
- **缓存**: Redis (ioredis + Redlock)
- **消息队列**: Kafka
- **RPC**: gRPC
- **AI 集成**: OpenAI API
- **PPT 处理**: pptxtojson, Playwright
- **包管理**: pnpm

### 控制台 (`console/`)
- **框架**: React + UmiJS (Ant Design Pro)
- **UI 组件**: Ant Design 5.x
- **语言**: TypeScript
- **测试**: Jest
- **包管理**: pnpm

## 快速开始

### 环境要求
- Node.js >= 18
- MongoDB
- Redis
- pnpm

### 安装依赖

```bash
# 安装 API 服务依赖
cd api
pnpm install

# 安装控制台依赖
cd ../console
pnpm install
```

### 配置环境变量

```bash
# API 服务配置
cd api
cp .env.example .env
# 编辑 .env 文件，配置数据库、Redis、OpenAI 等连接信息

# 控制台配置
cd ../console
cp .env.example .env
# 编辑 .env 文件，配置 API 服务地址等
```

### 启动服务

```bash
# 启动 API 服务（开发模式）
cd api
pnpm dev

# 启动 gRPC 服务
pnpm grpc

# 启动控制台（开发模式）
cd console
pnpm dev
```

## 主要功能

- **PPT 存储管理**: 支持 PPT JSON 格式的增删改查
- **AI PPT 生成**: 集成 OpenAI API，支持 AI 自动生成演示文稿
- **PPTX 导入导出**: 支持 .pptx 文件解析与转换
- **用户认证**: 完整的用户注册、登录、权限管理
- **控制台**: 可视化管理界面，支持内容管理与数据统计
- **gRPC 服务**: 提供高性能 RPC 接口
- **API 文档**: 集成 Swagger/Scalar 自动生成 API 文档

## 常用命令

### API 服务
```bash
pnpm start      # 生产环境启动
pnpm dev        # 开发模式（热重载）
pnpm grpc       # 启动 gRPC 服务
pnpm test       # 运行测试
```

### 控制台
```bash
pnpm dev        # 开发模式
pnpm build      # 生产构建
pnpm lint       # 代码检查
pnpm test       # 运行测试
```

## 许可证

[MIT](LICENSE)
