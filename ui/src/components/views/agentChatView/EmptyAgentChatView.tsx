import React, { useState, useMemo } from "react";
import { Card, Typography, Select, message as antdMessage } from "antd";
import {
  BulbOutlined,
  MessageOutlined,
  RobotOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { Sender } from "@ant-design/x";
import { useNavigate } from "react-router-dom";
import {
  type AgentVO,
  createChatMessage,
  createChatSession,
} from "../../../api/api.ts";
import { getAgentEmoji } from "../../../utils";
import { useChatSessions } from "../../../hooks/useChatSessions.ts";

const { Title, Text } = Typography;

const quickActions = [
  {
    title: "智能对话",
    description: "让助手拆解任务、补充思路，并给出可执行建议",
    icon: <RobotOutlined className="text-white text-xl" />,
    className: "from-blue-500 to-cyan-500",
  },
  {
    title: "知识问答",
    description: "结合已上传的 Markdown 知识库检索上下文",
    icon: <BulbOutlined className="text-white text-xl" />,
    className: "from-emerald-500 to-teal-500",
  },
  {
    title: "过程可见",
    description: "通过 SSE 实时展示规划、思考与工具执行状态",
    icon: <MessageOutlined className="text-white text-xl" />,
    className: "from-amber-500 to-rose-500",
  },
];

interface DefaultAgentChatViewProps {
  handleSendMessage: (message: string) => void;
  loading: boolean;
  agents: AgentVO[];
}

const EmptyAgentChatView: React.FC<DefaultAgentChatViewProps> = ({
  loading,
  agents,
}) => {
  const [message, setMessage] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const navigate = useNavigate();
  const { refreshChatSessions } = useChatSessions();

  // 为每个 agent 生成 emoji
  const agentsWithEmoji = useMemo(() => {
    return agents.map((agent) => ({
      ...agent,
      emoji: getAgentEmoji(agent.id),
    }));
  }, [agents]);

  // 计算实际选中的 agent ID（如果用户没有选择，则使用默认的第一个）
  const effectiveAgentId = useMemo(() => {
    if (selectedAgentId) {
      return selectedAgentId;
    }
    return agents.length > 0 ? agents[0].id : null;
  }, [selectedAgentId, agents]);

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    if (!effectiveAgentId) {
      antdMessage.warning("请先创建一个智能体助手");
      return;
    }
    if (!trimmedMessage) {
      antdMessage.warning("请输入要发送的消息");
      return;
    }

    const response = await createChatSession({
      agentId: effectiveAgentId,
      title: trimmedMessage.slice(0, 20),
    });
    await createChatMessage({
      sessionId: response.chatSessionId ?? "",
      content: trimmedMessage,
      role: "user",
      agentId: effectiveAgentId,
    });
    await refreshChatSessions();
    setMessage("");
    navigate(`/chat/${response.chatSessionId}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent 选择器 - 顶部 */}
      {agents.length > 0 && (
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center justify-start">
            <Select
              value={effectiveAgentId}
              onChange={(value) => setSelectedAgentId(value)}
              style={{ width: 200 }}
              className="agent-selector"
              suffixIcon={<DownOutlined className="text-gray-400" />}
              placeholder="选择智能体助手"
              optionRender={(option) => (
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {agentsWithEmoji.find((a) => a.id === option.value)?.emoji}
                  </span>
                  <span className="text-sm">{option.label}</span>
                </div>
              )}
              options={agentsWithEmoji.map((agent) => ({
                value: agent.id,
                label: agent.name,
              }))}
            />
          </div>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center mb-8">
            <Title level={2} className="mb-2">
              ThinkLoop Agent 工作台
            </Title>
            <Text type="secondary" className="text-base">
              选择智能体后发起任务，观察模型规划、工具调用与知识库检索过程
            </Text>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action) => (
              <Card
                key={action.title}
                hoverable
                className="h-full transition-all hover:shadow-lg"
              >
                <div
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${action.className}`}
                >
                  {action.icon}
                </div>
                <Title level={5} className="mb-2">
                  {action.title}
                </Title>
                <Text type="secondary" className="text-sm">
                  {action.description}
                </Text>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 bg-white">
        {/* 输入框 */}
        <div className="px-4 pb-4 pt-4">
          <Sender
            onSubmit={handleSubmit}
            value={message}
            loading={loading || agents.length === 0}
            placeholder="输入消息开始对话..."
            onChange={(value) => {
              setMessage(value);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default EmptyAgentChatView;
