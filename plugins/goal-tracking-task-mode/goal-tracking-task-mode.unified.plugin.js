// plugins/goal-tracking-task-mode/goal-tracking-task-mode.unified.plugin.js
// Simple in-memory goal tracking
const conversationGoals = new Map();

export default {
  type: 'hook',
  name: 'goal-tracking-task-mode',
  version: 'v1.0.0',
  description: 'Unified plugin version: tracks goals and keeps conversations focused.',
  tags: ['goals', 'focus', 'task-management'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      maxGoals: { type: 'number', default: 3 },
      enforceFocus: { type: 'boolean', default: true },
      addProgress: { type: 'boolean', default: true },
      relevanceThreshold: { type: 'number', default: 0.1 },
    },
  },

  async run({ event, data, parameters }) {
    if (!parameters.enabled) return {};

    if (event === 'prompt:pre-process') {
      const { prompt, requestId } = data;

      // Extract goals from prompt
      const goals = extractGoals(prompt, parameters.maxGoals);
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
        return {
          outcome: 'focused',
          data: { ...data, prompt: enhancedPrompt, goals: currentGoals },
        };
      }

      return {};

    } else if (event === 'response:filter') {
      const { content, goals } = data;

      if (!goals || goals.length === 0) return {};

      let enhancedContent = content;

      // Check if response is on-topic and refocus if needed
      if (parameters.enforceFocus) {
        const onTopic = isOnTopic(content, goals, parameters.relevanceThreshold);
        if (!onTopic) {
          enhancedContent = `I notice this response may be going off-topic. Let me refocus on our goals: ${goals.join(', ')}.\n\n${content}`;
        }
      }

      // Add progress summary
      if (parameters.addProgress) {
        const progress = assessProgress(content, goals);
        if (progress) {
          enhancedContent = `${enhancedContent}\n\n**Progress:** ${progress}`;
        }
      }

      return {
        outcome: 'tracked',
        data: { ...data, content: enhancedContent },
      };
    }

    return {};
  },
};

// Helper functions
function extractGoals(prompt, maxGoals = 3) {
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
      const goal = match[1] ? match[1].trim() : match[2].trim();
      goals.push(goal);
    }
  }

  return goals.slice(0, maxGoals);
}

function isOnTopic(output, goals, threshold = 0.1) {
  const outputWords = output.toLowerCase().split(/\s+/);
  let relevanceScore = 0;

  for (const goal of goals) {
    const goalWords = goal.toLowerCase().split(/\s+/);
    const overlap = goalWords.filter(word => outputWords.includes(word)).length;
    relevanceScore += overlap / goalWords.length;
  }

  return relevanceScore / goals.length > threshold;
}

function assessProgress(output, goals) {
  // Simple progress assessment
  const lower = output.toLowerCase();
  if (lower.includes('completed') || lower.includes('finished') || lower.includes('done')) {
    return 'Goal appears to be completed.';
  }
  if (lower.includes('progress') || lower.includes('step') || lower.includes('working on')) {
    return 'Making progress toward goals.';
  }
  if (lower.includes('issue') || lower.includes('problem') || lower.includes('stuck')) {
    return 'Encountered challenges that need addressing.';
  }

  return null;
}