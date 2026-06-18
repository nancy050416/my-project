# ThinkLoop - AI Agent Assistant

ThinkLoop 是一个基于 Spring AI 的 AI Agent 应用实践项目，围绕「大模型对话 + 工具调用 + RAG 知识库 + 实时执行反馈」构建。

项目目标不是只做一个普通聊天框，而是实现一个可以根据上下文进行多轮决策、调用外部工具、检索知识库，并把执行过程实时推送给前端的智能体系统。

> 测评提交说明：本仓库可作为「开放式能力测评 / Agent」作品提交。高频真实场景选取为“企业知识库与项目资料问答助手”，核心价值是用 Agent Loop 将私有知识检索、工具调用和实时反馈组合成一个可观测、可扩展的智能工作流。详细提交说明见 [AGENT_SUBMISSION.md](./AGENT_SUBMISSION.md)。

## 项目定位

传统大模型应用通常是「用户输入 -> 调用模型 -> 返回结果」的一次性流程。ThinkLoop 在这个基础上加入 Agent Loop，让模型在每一轮中先判断下一步动作，再根据需要调用工具或知识库，最后继续结合工具结果生成回答。

项目重点关注以下能力：

- 基于 Spring AI 接入大模型能力
- 通过 Think-Execute 循环实现多步骤任务处理
- 手动接管 Tool Calling 流程，便于控制、持久化和观测
- 使用 PostgreSQL + pgvector 构建 RAG 知识库
- 使用 SSE 将 Agent 执行过程实时推送给前端
- 通过注册表模式支持多模型切换

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 | Java 17, Spring Boot 3.5.8, Spring AI, MyBatis |
| 数据与检索 | PostgreSQL, pgvector, Markdown Parser |
| AI 能力 | DeepSeek / ZhipuAI ChatModel, Ollama bge-m3 embedding |
| 前端 | React, TypeScript, Vite, Ant Design, Tailwind CSS |
| 实时通信 | Server-Sent Events |

## 核心功能

### Agent Think-Execute Loop

项目中的 Agent 核心流程由 `JChatMind` 实现。每次用户发送消息后，系统会创建一个 Agent 运行实例，并进入多轮执行流程：

```text
用户消息
-> 加载历史上下文
-> think(): 让模型判断下一步动作
-> execute(): 如果模型要求调用工具，则执行工具
-> 将工具结果写回上下文
-> 继续下一轮思考
-> 无工具调用 / 调用终止工具 / 达到最大步数后结束
```

项目中设置了最大执行步数，用来避免 Agent 因反复调用工具而陷入无限循环。

### 手动接管 Tool Calling

Spring AI 支持自动工具调用，但项目中关闭了默认的内部自动执行：

internalToolExecutionEnabled(false)

这样做的目的是让后端掌握工具调用的完整生命周期：

- 保存模型生成的工具调用请求
- 使用 ToolCallingManager 执行工具
- 保存工具返回结果
- 将中间过程通过 SSE 推送给前端
- 后续可以扩展工具权限、失败重试、审计日志等能力

工具分为固定工具和可选工具。固定工具默认可用，可选工具根据 Agent 配置动态加载，避免在 Agent 核心流程中写大量硬编码判断。

### RAG 知识库检索

项目支持上传 Markdown 文档，并将文档内容转化为可检索的知识片段。

处理流程：

```text
上传 Markdown 文档
-> 保存文档元数据
-> 解析 Markdown 章节
-> 生成 chunk
-> 调用 bge-m3 生成 embedding
-> 写入 PostgreSQL + pgvector
```

查询流程：

```text
用户问题
-> 生成 query embedding
-> 使用 pgvector 按向量距离排序
-> 取 Top-K 相关片段
-> 返回给 Agent 作为外部知识
```

核心 SQL 思路：

```sql
ORDER BY embedding <-> #{vectorLiteral}::vector
LIMIT #{limit}
```

选择 PostgreSQL + pgvector 的原因是：文档、chunk、embedding 强关联，放在同一个数据库中可以减少跨系统同步复杂度，也更容易保证元数据和向量数据的一致性。后续如果数据规模进一步增大，可以再考虑 Milvus 等专门向量数据库。

### 多模型切换

项目使用注册表模式管理不同模型的 ChatClient。

```text
DeepSeekChatModel / ZhiPuAiChatModel
-> ChatClient
-> ChatClientRegistry
-> Agent 根据配置选择模型
```

这样 Agent 不需要依赖具体模型实现。新增模型时，只需要新增对应的 ChatClient Bean，并在 Agent 配置中选择模型名称即可。

### SSE 实时推送

Agent 执行过程可能包含多轮思考、工具调用和知识库检索。如果等完整任务结束后再返回，用户体验会比较差。

项目通过 SSE 建立服务端到前端的长连接，将以下信息实时推送给前端：

- AI 生成内容
- 工具调用结果
- Agent 执行状态
- 任务结束或异常信息

SSE 更适合本项目这种服务端单向推送场景，相比 WebSocket 实现更轻量。

## 目录结构

### 后端模块

```text
jchatmind/
  src/main/java/com/kama/jchatmind/
    agent/              Agent 核心逻辑与运行时工厂
    agent/tools/        工具定义与工具实现
    config/             多模型配置、跨域、异步配置
    controller/         REST API 与 SSE 接口
    service/            业务服务接口
    service/impl/       业务服务实现
    mapper/             MyBatis Mapper
    model/              DTO、VO、Entity、Request、Response
    event/              聊天事件与监听器
    typehandler/        pgvector 类型处理
```

### 前端模块

```text
ui/
  src/
    api/                接口封装
    components/         页面组件与弹窗组件
    config/             前端运行时配置
    contexts/           会话上下文
    hooks/              Agent、知识库、文档、会话数据 Hook
    layout/             页面布局
    types/              前端类型定义
```

## 本地运行

### 后端配置

后端配置文件位于：

jchatmind/src/main/resources/application.yaml

需要配置：

- PostgreSQL 数据库地址
- 数据库账号密码
- DeepSeek 或 ZhipuAI API Key
- 邮件服务配置
- 本地文档存储路径

示例：

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/jchatmind
    username: postgres
    password: 123456
ai:
  deepseek:
    api-key: your-api-key
  zhipuai:
    api-key: your-api-key
```

RAG embedding 默认调用本地 Ollama：

http://localhost:11434/api/embeddings

需要提前准备 bge-m3 模型。

### 启动后端

```bash
cd jchatmind
./mvnw spring-boot:run
```

Windows：

```bash
cd jchatmind
mvnw.cmd spring-boot:run
```

### 启动前端

```bash
cd ui
npm install
npm run dev
```

前端默认连接：

- API: `http://localhost:8080/api`
- SSE: `http://localhost:8080/sse`

如需覆盖地址，可复制 `ui/.env.example` 为 `ui/.env.local`：

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_SSE_BASE_URL=http://localhost:8080/sse
```

## 最近优化

- 将前端 API 与 SSE 地址抽离为 Vite 环境变量，避免硬编码后端地址
- 优化新对话空态页的信息架构，突出 Agent、RAG 与实时执行反馈
- 改进 SSE 消息解析容错，异常消息不会直接中断页面逻辑
- 将聊天初始化中的消息与会话请求并行化，减少页面加载等待
- 重写 README 结构，补充技术栈、核心流程、目录说明和运行方式

## 我的理解与后续计划

这个项目最值得学习的地方不是单纯接入大模型 API，而是把大模型能力放进一个可控制的后端系统中：

- Agent Loop 解决「多步骤任务如何推进」
- Tool Calling 解决「模型如何使用外部能力」
- RAG 解决「模型如何使用私有知识」
- SSE 解决「长耗时任务如何让用户看到过程」
- ChatClientRegistry 解决「多模型如何解耦切换」

如果继续优化，我会重点做以下方向：

- 增加 RAG 评测集，评估 Top-K 召回效果
- 引入关键词检索 + 向量检索的混合召回
- 增加 rerank，提高知识片段排序质量
- 完善工具调用失败后的重试和降级机制
- 为 SSE 增加心跳和更完整的异常处理
- 增加 Prompt 版本管理与效果对比
