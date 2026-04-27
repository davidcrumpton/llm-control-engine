// plugins/goal-tracking-task-mode/goal-tracking-task-mode.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

// Simple in-memory goal tracking
const conversationGoals = new Map();

export default {
  meta: {
    name: 'goal-tracking-task-mode',
    version: '1.0.0',
    description: 'Tracks goals, keeps responses focused, and summarizes progress.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    // Extract and track goals from prompts
    tap(
      'prompt:pre-process',
      async (ctx) => {
        const { prompt, requestId } = ctx.data;

        // Extract goals from prompt
        const goals = extractGoals(prompt);
        if (goals.length > 0) {
          const existing = conversationGoals.get(requestId) || [];
          conversationGoals.set(requestId, [...existing, ...goals]);
        }

        // Get current goals for this conversation
        const currentGoals = conversationGoals.get(requestId) || [];

        if (currentGoals.length > 0) {
          // Add goal-focused instructions
          const goalContext = `Current goals: ${currentGoals.join(', ')}. Stay focused on these goals and avoid unrelated topics.\n\n`;
          const enhancedPrompt = goalContext + prompt;
          return { data: { ...ctx.data, prompt: enhancedPrompt, goals: currentGoals } };
        }

        return {};
      },
      HookPriority.NORMAL
    );

    // Track progress and prevent derailment
    tap(
      'response:filter',
      async (ctx) => {
        const { output, goals } = ctx.data;

        if (!goals || goals.length === 0) return {};

        // Check if response is on-topic
        const onTopic = isOnTopic(output, goals);
        if (!onTopic) {
          const refocused = `I notice this response may be going off-topic. Let me refocus on our goals: ${goals.join(', ')}.\n\n${output}`;
          return { data: { ...ctx.data, output: refocused } };
        }

        // Add progress summary
        const progress = assessProgress(output, goals);
        if (progress) {
          const enhancedOutput = `${output}\n\n**Progress:** ${progress}`;
          return { data: { ...ctx.data, output: enhancedOutput } };
        }

        return {};
      },
      HookPriority.NORMAL
    );
  },
};

// Helper functions
function extractGoals(prompt) {
  const goalPatterns = [
    /goal:?\s*([^.!?]+)/i,
    /task:?\s*([^.!?]+)/i,
    /objective:?\s*([^.!?]+)/i,
    /I (want|need) to ([^.!?]+)/i,
    /help me (with )?([^.!?]+)/i,
  ];

  const goals = [];
  for (const pattern of goalPatterns) {
    const match = prompt.match(pattern);
    if (match) {
      goals.push(match[1].trim());
    }
  }

  return goals.slice(0, 3); // Limit to 3 goals
}

function isOnTopic(output, goals) {
  const outputWords = output.toLowerCase().split(/\s+/);
  let relevanceScore = 0;

  for (const goal of goals) {
    const goalWords = goal.toLowerCase().split(/\s+/);
    const overlap = goalWords.filter(word => outputWords.includes(word)).length;
    relevanceScore += overlap / goalWords.length;
  }

  return relevanceScore / goals.length > 0.1; // At least 10% relevance
}

function assessProgress(output, goals) {
  // Simple progress assessment
  if (output.toLowerCase().includes('completed') || output.toLowerCase().includes('finished')) {
    return 'Goal appears to be completed.';
  }
  if (output.toLowerCase().includes('progress') || output.toLowerCase().includes('step')) {
    return 'Making progress toward goals.';
  }
  if (output.toLowerCase().includes('issue') || output.toLowerCase().includes('problem')) {
    return 'Encountered challenges that need addressing.';
  }

  return null;
}