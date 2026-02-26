import React from "react";
import { Box, Text } from "ink";

export const WelcomeBox: React.FC = () => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor="cyan"
    paddingX={2}
    paddingY={1}
  >
    <Text bold color="cyan">
      Try Agent — AI 命令行智能体
    </Text>
    <Text> </Text>
    <Text>
      一个可运行的 AI Agent，支持多模型切换、工具调用、MCP 协议、Sub-Agent 协作与 Skill 扩展。
    </Text>
    <Text> </Text>
    <Text dimColor>
      输入消息开始对话，输入 / 查看可用命令
    </Text>
  </Box>
);
