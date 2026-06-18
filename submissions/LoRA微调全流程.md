# LoRA 微调全流程

本文档以“企业知识库 Agent 的领域问答模型微调”为例，说明从数据预处理到模型合并验证的完整 LoRA 微调流程。目标是在不全量训练大模型的前提下，让模型更稳定地理解企业制度、项目术语、接口文档和内部问答格式。

> 提交摘要：本文按“目标定义 -> 环境准备 -> 数据准备 -> 预处理 -> LoRA 配置 -> 训练 -> 监控 -> 模型合并 -> 验证评估 -> 部署 -> 风险排查”的顺序组织，覆盖题目要求的数据预处理、模型合并与验证全流程，可作为规范式能力测评的 Markdown 作品提交。

## 评审对应关系

| 题目要求 | 文档对应章节 |
| --- | --- |
| 数据预处理 | 第 3-5 节：数据来源、格式、清洗、划分、Prompt 模板、Tokenization |
| LoRA 微调 | 第 6-8 节：LoRA 参数、模型加载、训练参数、Trainer 示例、训练监控 |
| 模型合并 | 第 9 节：分离部署、合并部署、合并前后测试 |
| 验证评估 | 第 10 节：自动评估、人工评估、对比实验 |
| 完整交付 | 第 11-14 节：部署、Agent 集成、常见问题、最终交付物与结论 |

## 1. 目标定义

### 1.1 业务目标

- 提升模型对企业内部术语、制度条款、项目缩写和接口名的理解能力。
- 让模型输出更稳定的结构，例如“结论、依据、步骤、风险、引用来源”。
- 减少无依据编造，遇到知识库证据不足时主动说明缺少材料。

### 1.2 技术目标

- 使用 LoRA 或 QLoRA 降低训练显存成本。
- 保留基座模型通用能力，只微调少量低秩矩阵参数。
- 训练完成后输出 adapter，并可选择合并到基座模型。
- 通过固定评测集验证准确率、格式稳定性和幻觉率。

## 2. 环境准备

### 2.1 推荐硬件

| 模型规模 | 推荐方式 | 显存建议 |
| --- | --- | --- |
| 1.5B-3B | LoRA / QLoRA | 8GB-16GB |
| 7B-8B | QLoRA 4bit | 16GB-24GB |
| 14B | QLoRA + 梯度检查点 | 24GB-48GB |

### 2.2 软件依赖

```bash
conda create -n lora-ft python=3.11 -y
conda activate lora-ft

pip install torch transformers datasets peft accelerate bitsandbytes sentencepiece
pip install scikit-learn pandas numpy evaluate
```

如果使用国内或公司内网环境，需要提前配置 Python 包镜像、模型缓存目录和 Hugging Face 镜像。

## 3. 数据准备

### 3.1 数据来源

可用于微调的数据包括：

- 企业制度文档整理出的问答对。
- 技术 Wiki 中的接口说明、排障记录、FAQ。
- 项目复盘中的问题、原因、处理方案。
- 客服或内部工单中已人工确认的标准回答。
- 人工构造的高质量指令数据。

不建议直接把原始文档整篇塞入微调集。原始知识更适合放在 RAG 知识库中，微调数据应强调回答方式、任务理解、工具选择和企业术语习惯。

### 3.2 数据格式

推荐使用 JSONL，每行一个样本：

```json
{"instruction":"查询差旅报销需要哪些材料","input":"员工提问：我本周出差回来，报销需要准备什么？","output":"结论：需要准备发票、行程单、审批单和付款凭证。\n依据：差旅报销制度第 3.2 条。\n步骤：1. 在系统提交报销单；2. 上传发票和行程单；3. 关联出差审批；4. 等待财务审核。\n风险：超过规定期限可能需要补充说明。"}
```

也可以使用 messages 格式，便于兼容 Chat 模型：

```json
{"messages":[{"role":"system","content":"你是企业知识库 Agent，回答必须结构化并说明依据。"},{"role":"user","content":"支付回调接口重复通知怎么办？"},{"role":"assistant","content":"结论：需要按业务订单号或回调流水号做幂等处理。\n依据：支付接口文档的回调处理章节。\n步骤：1. 验签；2. 查询订单状态；3. 未处理则更新；4. 已处理则直接返回成功。"}]}
```

### 3.3 数据规模

| 阶段 | 样本量 | 目标 |
| --- | --- | --- |
| 快速验证 | 200-500 | 验证训练流程是否跑通 |
| 小规模可用 | 1,000-3,000 | 学会固定回答格式和常见术语 |
| 业务增强 | 5,000-20,000 | 提升多场景稳定性 |

质量优先于数量。1000 条干净、统一、可验证的数据，通常比 10000 条噪声数据更有价值。

## 4. 数据清洗与预处理

### 4.1 清洗规则

- 删除重复样本、乱码、空回答和过短回答。
- 去除手机号、身份证号、客户姓名、内部密钥等敏感信息。
- 统一术语，例如“知识库”“KB”“文档库”统一为业务指定名称。
- 保证答案与问题对应，不能答非所问。
- 对无依据问题加入拒答样本，例如“当前资料不足，无法确认”。

### 4.2 划分数据集

```text
train.jsonl      80%
valid.jsonl      10%
test.jsonl       10%
```

划分时要避免同一原始文档生成的相似问答同时出现在训练集和测试集，否则评估会虚高。

### 4.3 Prompt 模板

指令格式建议固定：

```text
<|system|>
你是企业知识库 Agent。请基于已知信息回答，缺少依据时必须说明不确定。
<|user|>
{instruction}
{input}
<|assistant|>
{output}
```

训练、验证和线上推理必须使用同一套模板，否则模型学到的格式会不稳定。

## 5. Tokenization

### 5.1 长度控制

- 单条样本最大长度建议 2048 或 4096 tokens。
- 过长样本优先拆分，不建议直接截断关键答案。
- 输出部分太短会导致模型只学到模板，太长则会降低训练效率。

### 5.2 Label Mask

监督微调时通常只计算 assistant 输出部分的 loss，system 和 user 部分只作为上下文。

```python
labels = input_ids.copy()
labels[:assistant_start] = -100
```

这样可以避免模型学习复述用户问题。

## 6. LoRA 配置

### 6.1 关键参数

| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `r` | 8 / 16 / 32 | 低秩矩阵维度，越大可学习能力越强 |
| `lora_alpha` | 16 / 32 / 64 | 缩放系数，通常为 r 的 2 倍 |
| `lora_dropout` | 0.05 | 防止过拟合 |
| `target_modules` | `q_proj,k_proj,v_proj,o_proj` | 常见注意力层注入位置 |
| `bias` | `none` | 通常不训练 bias |
| `task_type` | `CAUSAL_LM` | 自回归语言模型 |

### 6.2 示例配置

```python
from peft import LoraConfig, TaskType

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)
```

## 7. 训练流程

### 7.1 加载模型

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import get_peft_model

base_model = "Qwen/Qwen2.5-7B-Instruct"

tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    base_model,
    device_map="auto",
    torch_dtype="auto",
    trust_remote_code=True,
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
```

### 7.2 QLoRA 4bit 加载

```python
from transformers import BitsAndBytesConfig
import torch

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    base_model,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)
```

### 7.3 训练参数

| 参数 | 推荐值 |
| --- | --- |
| epoch | 2-4 |
| learning rate | `1e-4` 到 `2e-4` |
| batch size | 根据显存设置 |
| gradient accumulation | 4-16 |
| warmup ratio | 0.03 |
| weight decay | 0.01 |
| lr scheduler | cosine |
| max grad norm | 1.0 |

### 7.4 Trainer 示例

```python
from transformers import TrainingArguments, Trainer

training_args = TrainingArguments(
    output_dir="./outputs/insightmesh-lora",
    num_train_epochs=3,
    per_device_train_batch_size=2,
    per_device_eval_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=2e-4,
    warmup_ratio=0.03,
    logging_steps=10,
    eval_strategy="steps",
    eval_steps=100,
    save_steps=100,
    save_total_limit=3,
    bf16=True,
    report_to="none",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=valid_dataset,
    tokenizer=tokenizer,
)

trainer.train()
trainer.save_model("./outputs/insightmesh-lora/final")
```

## 8. 训练监控

训练过程中重点观察：

- train loss 是否持续下降。
- eval loss 是否先下降后上升，若上升明显说明过拟合。
- 模型是否开始稳定输出指定格式。
- 是否出现“全部回答模板化但内容变空”的退化。
- 是否出现知识幻觉增加。

如果训练 loss 很低但实际效果差，通常是数据格式、label mask 或评测集存在问题。

## 9. 模型合并

训练完成后会得到 LoRA adapter。部署时有两种方式：

### 9.1 分离部署

基座模型 + adapter 分开加载，优点是便于切换不同业务 adapter。

```python
from peft import PeftModel

base = AutoModelForCausalLM.from_pretrained(base_model, device_map="auto", torch_dtype="auto")
model = PeftModel.from_pretrained(base, "./outputs/insightmesh-lora/final")
```

### 9.2 合并部署

将 adapter 合并到基座模型，优点是推理部署更简单。

```python
merged = model.merge_and_unload()
merged.save_pretrained("./outputs/insightmesh-merged")
tokenizer.save_pretrained("./outputs/insightmesh-merged")
```

合并前后都需要跑同一套测试集，确认答案没有明显漂移。

## 10. 验证评估

### 10.1 自动评估

| 维度 | 方法 |
| --- | --- |
| 格式遵循 | 检查是否包含结论、依据、步骤等字段 |
| 关键词命中 | 与标准答案关键词匹配 |
| 引用意识 | 检查是否在无依据问题上拒答 |
| 长度控制 | 检查回答是否过短或冗长 |

### 10.2 人工评估

准备 50-200 条固定问题，按以下标准打分：

| 分数 | 标准 |
| --- | --- |
| 5 | 完全正确，结构清晰，有依据 |
| 4 | 基本正确，少量表述不完整 |
| 3 | 部分正确，但缺少关键约束 |
| 2 | 答案泛化，无法用于业务 |
| 1 | 错误或明显幻觉 |

### 10.3 对比实验

至少比较三组：

- 基座模型直接回答。
- RAG + 基座模型。
- RAG + LoRA 微调模型。

如果 LoRA 后知识事实没有提升，但格式和工具选择更稳定，也属于有效收益。事实性知识仍应优先由 RAG 提供。

## 11. 部署方案

### 11.1 推理服务

可以使用 vLLM、Text Generation Inference、Ollama 或自建 FastAPI 服务。

服务需要提供：

- `/chat/completions`：对话生成。
- `/health`：健康检查。
- `/metrics`：延迟、吞吐、错误率。

### 11.2 与 Agent 集成

在 Agent 项目中将微调模型作为 ChatClient 的一个可选模型：

```text
DeepSeek ChatClient
ZhipuAI ChatClient
InsightMesh LoRA ChatClient
```

通过注册表模式统一管理，前端创建 Agent 时选择模型即可。

## 12. 常见问题与排查

### 12.1 模型只背训练数据

原因：

- 数据量太小且重复。
- 训练 epoch 太多。
- learning rate 太大。

处理：

- 去重并增加多样化表达。
- 降低 epoch 或 learning rate。
- 增加 valid loss 早停。

### 12.2 输出格式不稳定

原因：

- 训练样本格式不统一。
- 线上 prompt 与训练 prompt 不一致。

处理：

- 固定模板。
- 在 system prompt 中再次强调字段。
- 对输出做轻量格式校验。

### 12.3 幻觉增加

原因：

- 训练集中存在无依据的肯定回答。
- 模型把领域风格当成事实记忆。

处理：

- 增加拒答样本。
- 将事实性知识放回 RAG。
- 答案生成阶段强制引用检索片段。

### 12.4 显存不足

处理：

- 使用 QLoRA 4bit。
- 减小 batch size。
- 开启 gradient checkpointing。
- 降低 max sequence length。
- 提高 gradient accumulation。

## 13. 最终交付物

训练完成后应归档以下内容：

```text
lora-release/
├─ adapter_config.json
├─ adapter_model.safetensors
├─ tokenizer files
├─ train_config.yaml
├─ data_report.md
├─ eval_report.md
└─ merge_model.sh
```

其中 `data_report.md` 记录数据来源、清洗规则、样本量和敏感信息处理方式；`eval_report.md` 记录测试集、评分标准、对比结果和失败案例。

## 14. 结论

LoRA 微调不是替代 RAG，而是增强 Agent 的任务理解、领域表达和输出格式稳定性。企业知识库场景中，最佳实践是：

```text
RAG 提供事实依据
LoRA 提供领域表达和行为习惯
Agent Loop 决定何时检索、何时调用工具、何时拒答
```

这样既能提升回答质量，又能控制幻觉风险，并保持系统可解释、可维护、可扩展。
