# 在线课件服务（基于 Node.js Fastify）

PPTist 后端 API 服务，提供 PPT 的 JSON 格式存储、AI 生成 PPT 接口、模板管理等功能。

## 技术栈

- **框架**: Fastify 5.x
- **数据库**: MongoDB (Mongoose)
- **缓存**: Redis (ioredis + Redlock)
- **消息队列**: Kafka
- **RPC**: gRPC
- **AI 集成**: OpenAI API
- **PPT 处理**: pptxtojson, Playwright
- **日志**: Pino
- **API 文档**: Swagger + Scalar

## 项目结构

```
api/
├── app.js              # Fastify 应用入口
├── server.js           # HTTP 服务器入口
├── conf/               # 配置文件
├── routes/             # 路由定义
│   ├── ppt/            # PPT 核心接口
│   ├── ppt-my/         # 用户课件接口
│   ├── llm/            # AI/LLM 接口
│   └── tools/          # 工具接口
├── services/           # 业务逻辑
│   ├── core/           # 核心服务 (pptInfo, llm, tmpl, importPptx 等)
│   ├── agent/          # Agent 任务系统
│   └── statistic/      # 统计服务
├── daos/               # 数据访问层
│   ├── core/           # MongoDB 数据访问
│   ├── cache/          # Redis 缓存
│   └── kafka/          # Kafka 消息
├── grpc/               # gRPC 服务
│   ├── servers/        # gRPC 服务端
│   └── clients/        # gRPC 客户端 (调用外部服务)
├── plugins/            # Fastify 插件
├── types/              # 类型定义
├── tools/              # 工具函数
├── logger/             # 日志配置
└── extends/            # 扩展模块
```

## API 接口

### PPT 接口 (`/ppt`)
| 接口 | 方法 | 描述 |
|------|------|------|
| `/detail` | GET | 获取课件详情 |
| `/save` | POST | 保存课件 |
| `/demo` | GET | 获取演示课件 |
| `/tmpl` | GET | 获取模板列表 |
| `/tmpl/prompt` | GET | 获取模板提示词 |
| `/import-pptx` | POST | 导入 PPTX 文件 |

### 用户课件接口 (`/ppt-my`)
| 接口 | 方法 | 描述 |
|------|------|------|
| `/list` | POST | 获取用户课件列表 |

### AI/LLM 接口 (`/llm`)
| 接口 | 方法 | 描述 |
|------|------|------|
| `/gen-ppt-syllabus` | POST | 生成课件大纲 |
| `/gen-ppt-syllabus/stream` | POST | 生成课件大纲 (流式) |
| `/ideology` | POST | 获取课程思政内容 |
| `/gen-ppt` | POST | 生成课件 |
| `/gen-ppt/stream` | POST | 生成课件 (流式) |

### 工具接口 (`/tools`)
| 接口 | 方法 | 描述 |
|------|------|------|
| `/img_search` | POST | 图片搜索 (Pexels) |
| `/ai_writing` | POST | AI 写作 (流式) |

### 管理接口 (`/ppt/ipmi`)
| 接口 | 方法 | 描述 |
|------|------|------|
| `/list` | POST | 课件列表 (分页) |
| `/detail` | GET | 课件详情 |
| `/update` | POST | 更新课件 |
| `/delete` | POST | 删除课件 |
| `/enable` | POST | 启用课件 |
| `/disable` | POST | 禁用课件 |

## 快速开始

### 环境要求
- Node.js >= 18
- MongoDB
- Redis

### 安装依赖
```bash
pnpm install
```

### 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库、Redis、OpenAI 等连接信息
```

### 启动服务
```bash
# 开发模式（热重载）
pnpm dev

# 生产模式
pnpm start

# 启动 gRPC 服务
pnpm grpc
```

### API 文档
启动服务后访问：
- Swagger UI: `/documentation`

## 外部服务依赖

| 服务 | 协议 | 用途 |
|------|------|------|
| User Center | gRPC/HTTP | 用户中心 |
| RAG Service | gRPC/HTTP | 知识库检索 |
| LLM Service | gRPC/HTTP | 大语言模型 |
| Document Service | gRPC | 文件管理 |
| Transform Service | gRPC | 文档转换 (PDF/Word/Excel/HTML) |
| Pexels API | HTTP | 图片搜索 |

## 测试
```bash
pnpm test
```
