export class TokenBudgetManager {
  constructor(dailyLimit = 150000) {
    this.dailyLimit = dailyLimit;
    this.used = 0;
  }
  
  reserveTokens(estimated) {
    if (this.used + estimated > this.dailyLimit) {
      throw Object.assign(new Error(`LLM budget unavailable. Needed: ${estimated}, Remaining: ${this.dailyLimit - this.used}`), { code: "BUDGET_EXHAUSTED" });
    }
    this.used += estimated;
    return true;
  }
  
  getStats() {
    return {
      dailyLimit: this.dailyLimit,
      used: this.used,
      remaining: this.dailyLimit - this.used
    };
  }
}

export const globalBudget = new TokenBudgetManager(Number(process.env.DAILY_LLM_BUDGET || 150000));
