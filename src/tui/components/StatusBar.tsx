import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  modelName: string;
  loading: boolean;
  backgroundTaskCount?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ modelName, loading, backgroundTaskCount }) => {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loading]);

  return (
    <Box paddingX={1}>
      <Text bold color="cyan">
        {modelName}
      </Text>
      {loading && (
        <>
          <Text> </Text>
          <Text color="yellow">
            Working...{" "}
            {elapsed >= 60
              ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s`
              : `${elapsed}s`}
          </Text>
        </>
      )}
      {(backgroundTaskCount ?? 0) > 0 && (
        <>
          <Text> </Text>
          <Text color="magenta">
            [{backgroundTaskCount} background task{backgroundTaskCount! > 1 ? "s" : ""}]
          </Text>
        </>
      )}
    </Box>
  );
};
