# ThinkLoop - 智能 AI Agent 系统

基于 Spring AI 框架构建的智能 AI Agent 系统，实现自主决策、工具调用和知识库检索功能。系统采用 Think-Execute 循环机制，支持多模型切换、RAG 检索和实时通信，能够完成复杂的多步骤任务。

## 技术栈

- **后端框架**: Spring Boot 3.5.8、Spring AI 1.1.0
- **数据库**: PostgreSQL、pgvector（向量相似度搜索）
- **持久层**: MyBatis
- **前端**: React
- **通信协议**: SSE（Server-Sent Events，实时推送）

## 核心功能

- **Think-Execute 循环引擎**：实现 Agent 自主思考与执行的核心循环，支持状态管理
- **工具调用系统**：支持固定工具和可选工具的灵活配置
- **RAG 知识库检索**：基于 pgvector 进行向量相似度搜索，实现智能问答
- **多模型支持**：通过 ChatClientRegistry 注册表模式，支持多种 AI 模型灵活切换
- **实时通信**：基于 SSE 技术，实时推送 Agent 执行状态
- **RESTful API**：提供统一响应格式，完整封装后端服务接口

## 项目结构（示例）
ThinkLoop/
├── src/main/java/
│ ├── agent/ # Agent 核心引擎
│ ├── tool/ # 工具调用系统
│ ├── rag/ # RAG 知识库检索
│ ├── model/ # 多模型支持（ChatClientRegistry）
│ ├── api/ # RESTful API 控制器
│ └── config/ # 配置类
├── src/main/resources/
│ ├── mapper/ # MyBatis Mapper 文件
│ └── application.yml # 配置文件
└── frontend/ # React 前端


