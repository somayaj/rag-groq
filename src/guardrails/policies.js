/**
 * Guardrails and Policies
 * Content filtering, safety checks, and policy enforcement
 */

export class Guardrails {
  constructor(config = {}) {
    this.enabled = config.enabled ?? true;
    this.blockedTerms = config.blockedTerms || [];
    this.sensitiveTopics = config.sensitiveTopics || [];
    this.maxQueryLength = config.maxQueryLength || 2000;
    this.maxResponseLength = config.maxResponseLength || 10000;
    this.rateLimit = config.rateLimit || null; // { requests: 100, window: 60000 }
    this.requestCounts = new Map();
    this.policies = config.policies || this.getDefaultPolicies();
  }

  /**
   * Get default policies
   */
  getDefaultPolicies() {
    return {
      // Block queries containing these terms
      blockedTerms: [
        'hack', 'exploit', 'malware', 'virus', 'phishing',
        'illegal', 'unlawful', 'harmful', 'dangerous'
      ],
      
      // Sensitive topics that require careful handling
      sensitiveTopics: [
        'medical advice', 'legal advice', 'financial advice',
        'personal information', 'private data'
      ],
      
      // Content moderation rules
      contentModeration: {
        blockExplicit: true,
        blockViolence: true,
        blockHateSpeech: true
      },
      
      // Response policies
      responsePolicies: {
        noMedicalDiagnosis: true,
        noLegalAdvice: true,
        noFinancialAdvice: true,
        citeSources: true
      }
    };
  }

  /**
   * Validate a query before processing
   * @param {string} query - User query
   * @param {string} userId - Optional user identifier for rate limiting
   * @returns {Object} - { allowed: boolean, reason?: string, sanitized?: string }
   */
  validateQuery(query, userId = 'default') {
    if (!this.enabled) {
      return { allowed: true, sanitized: query };
    }

    // Check query length
    if (query.length > this.maxQueryLength) {
      return {
        allowed: false,
        reason: `Query exceeds maximum length of ${this.maxQueryLength} characters`
      };
    }

    // Rate limiting
    if (this.rateLimit) {
      const now = Date.now();
      const userRequests = this.requestCounts.get(userId) || [];
      const recentRequests = userRequests.filter(time => now - time < this.rateLimit.window);
      
      if (recentRequests.length >= this.rateLimit.requests) {
        return {
          allowed: false,
          reason: `Rate limit exceeded. Maximum ${this.rateLimit.requests} requests per ${this.rateLimit.window / 1000} seconds`
        };
      }
      
      recentRequests.push(now);
      this.requestCounts.set(userId, recentRequests);
    }

    // Sanitize query
    const sanitized = this.sanitizeInput(query);
    
    // Check for blocked terms
    const lowerQuery = sanitized.toLowerCase();
    for (const term of this.blockedTerms) {
      if (lowerQuery.includes(term.toLowerCase())) {
        return {
          allowed: false,
          reason: `Query contains blocked content`,
          sanitized
        };
      }
    }

    // Check for sensitive topics (warn but allow)
    const sensitiveFound = [];
    for (const topic of this.sensitiveTopics) {
      if (lowerQuery.includes(topic.toLowerCase())) {
        sensitiveFound.push(topic);
      }
    }

    return {
      allowed: true,
      sanitized,
      warnings: sensitiveFound.length > 0 ? {
        sensitiveTopics: sensitiveFound,
        message: 'This query may involve sensitive topics. Responses are for informational purposes only.'
      } : null
    };
  }

  /**
   * Validate response before returning
   * @param {string} response - LLM response
   * @returns {Object} - { allowed: boolean, sanitized?: string, reason?: string }
   */
  validateResponse(response) {
    if (!this.enabled) {
      return { allowed: true, sanitized: response };
    }

    // Check response length
    if (response.length > this.maxResponseLength) {
      return {
        allowed: false,
        reason: `Response exceeds maximum length of ${this.maxResponseLength} characters`
      };
    }

    // Sanitize response
    const sanitized = this.sanitizeOutput(response);

    // Content moderation checks
    if (this.policies.contentModeration) {
      const checks = this.checkContentModeration(sanitized);
      if (!checks.allowed) {
        return {
          allowed: false,
          reason: checks.reason,
          sanitized
        };
      }
    }

    return {
      allowed: true,
      sanitized
    };
  }

  /**
   * Sanitize input query
   */
  sanitizeInput(text) {
    if (!text) return '';
    
    return text
      // Remove potential script injection
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      // Remove SQL injection patterns
      .replace(/['";\\]/g, '')
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Sanitize output response
   */
  sanitizeOutput(text) {
    if (!text) return '';
    
    return text
      // Remove script tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove dangerous HTML attributes
      .replace(/on\w+\s*=/gi, '')
      // Escape remaining HTML
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Restore safe formatting
      .replace(/&lt;br&gt;/g, '<br>')
      .replace(/&lt;strong&gt;/g, '<strong>')
      .replace(/&lt;\/strong&gt;/g, '</strong>')
      .replace(/&lt;em&gt;/g, '<em>')
      .replace(/&lt;\/em&gt;/g, '</em>')
      .trim();
  }

  /**
   * Check content moderation rules
   */
  checkContentModeration(text) {
    const lowerText = text.toLowerCase();
    
    // Check for explicit content
    if (this.policies.contentModeration.blockExplicit) {
      const explicitTerms = ['explicit', 'nsfw', 'adult content'];
      for (const term of explicitTerms) {
        if (lowerText.includes(term)) {
          return {
            allowed: false,
            reason: 'Response contains inappropriate content'
          };
        }
      }
    }

    // Check for violence
    if (this.policies.contentModeration.blockViolence) {
      const violenceTerms = ['kill', 'murder', 'violence', 'harm', 'attack'];
      for (const term of violenceTerms) {
        if (lowerText.includes(term) && lowerText.length < 500) {
          // Only block if it's a short response (likely not educational)
          return {
            allowed: false,
            reason: 'Response may contain violent content'
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Apply response policies (add disclaimers, etc.)
   */
  applyResponsePolicies(response, query) {
    if (!this.policies.responsePolicies) {
      return response;
    }

    const lowerQuery = query.toLowerCase();
    let disclaimers = [];

    // Medical disclaimer
    if (this.policies.responsePolicies.noMedicalDiagnosis) {
      if (lowerQuery.includes('symptom') || lowerQuery.includes('diagnosis') || 
          lowerQuery.includes('treatment') || lowerQuery.includes('medical')) {
        disclaimers.push('⚠️ This is not medical advice. Consult a healthcare professional for medical concerns.');
      }
    }

    // Legal disclaimer
    if (this.policies.responsePolicies.noLegalAdvice) {
      if (lowerQuery.includes('legal') || lowerQuery.includes('law') || 
          lowerQuery.includes('lawsuit') || lowerQuery.includes('attorney')) {
        disclaimers.push('⚠️ This is not legal advice. Consult a qualified attorney for legal matters.');
      }
    }

    // Financial disclaimer
    if (this.policies.responsePolicies.noFinancialAdvice) {
      if (lowerQuery.includes('investment') || lowerQuery.includes('stock') || 
          lowerQuery.includes('financial') || lowerQuery.includes('trading')) {
        disclaimers.push('⚠️ This is not financial advice. Consult a financial advisor for investment decisions.');
      }
    }

    if (disclaimers.length > 0) {
      return response + '\n\n' + disclaimers.join('\n');
    }

    return response;
  }

  /**
   * Check if document content should be filtered
   */
  validateDocument(content) {
    if (!this.enabled) {
      return { allowed: true };
    }

    const lowerContent = content.toLowerCase();
    
    // Check for blocked terms in document
    for (const term of this.blockedTerms) {
      if (lowerContent.includes(term.toLowerCase())) {
        return {
          allowed: false,
          reason: 'Document contains blocked content'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get guardrails statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      blockedTermsCount: this.blockedTerms.length,
      sensitiveTopicsCount: this.sensitiveTopics.length,
      rateLimit: this.rateLimit,
      activeUsers: this.requestCounts.size
    };
  }

  /**
   * Update policies
   */
  updatePolicies(newPolicies) {
    if (newPolicies.blockedTerms) {
      this.blockedTerms = [...this.blockedTerms, ...newPolicies.blockedTerms];
    }
    if (newPolicies.sensitiveTopics) {
      this.sensitiveTopics = [...this.sensitiveTopics, ...newPolicies.sensitiveTopics];
    }
    if (newPolicies.rateLimit) {
      this.rateLimit = newPolicies.rateLimit;
    }
  }

  /**
   * Reset rate limits for a user
   */
  resetRateLimit(userId) {
    this.requestCounts.delete(userId);
  }

  /**
   * Clear all rate limits
   */
  clearRateLimits() {
    this.requestCounts.clear();
  }
}

