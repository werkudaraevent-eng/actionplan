/**
 * emailService.js — Frontend utility for sending custom transactional emails
 * via the Supabase Edge Function `send-email` (Nodemailer SMTP-backed).
 *
 * SMTP credentials are stored in Supabase Secrets and never exposed to the client.
 *
 * Usage:
 *   import { sendCustomEmail } from '../services/emailService';
 *   await sendCustomEmail('user@example.com', 'Hello!', '<h1>Hi</h1>');
 */

import { supabase } from '../lib/supabase';

/**
 * Send a custom transactional email through the `send-email` Edge Function.
 *
 * @param {string|string[]} to       — Recipient email(s)
 * @param {string}          subject  — Email subject line
 * @param {string}          html     — HTML body content
 * @param {string}          [text]   — Optional plain-text fallback
 * @returns {Promise<{ success: boolean, message: string, id?: string }>}
 */
export async function sendCustomEmail(to, subject, html, text) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject, html, text },
  });

  if (error) {
    // Supabase functions.invoke wraps HTTP errors
    throw new Error(error.message || 'Failed to invoke send-email function');
  }

  if (!data?.success) {
    throw new Error(data?.message || 'Email send failed');
  }

  return data;
}

// ─── Pre-built Test Email Templates ─────────────────────────────────────────

const WERKUDARA_STYLES = `
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; line-height: 1.6; color: #1f2937; }
    .container { max-width: 560px; margin: 0 auto; padding: 32px; }
    .header { background: linear-gradient(135deg, #0d9488, #0f766e); color: white; padding: 24px 32px; border-radius: 12px 12px 0 0; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { background: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 28px 32px; border-radius: 0 0 12px 12px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-info { background: #dbeafe; color: #1d4ed8; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .detail-label { font-size: 13px; color: #6b7280; }
    .detail-value { font-size: 13px; font-weight: 600; color: #111827; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
`;

/**
 * Generate a test email HTML for a specific template type.
 */
export function generateTestEmailHtml(templateType) {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  switch (templateType) {
    case 'deadline_reminder':
      return `<!DOCTYPE html><html><head>${WERKUDARA_STYLES}</head><body>
        <div class="container">
          <div class="header">
            <h1>Deadline Reminder</h1>
            <p>Action Plan Tracker - Werkudara Group</p>
          </div>
          <div class="body">
            <p>Hi <strong>Test User</strong>,</p>
            <p>This is a <span class="badge badge-warning">TEST</span> deadline reminder email.</p>
            <div style="margin: 20px 0; padding: 16px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Period</span>
                <span class="detail-value">January 2026</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Lock Date</span>
                <span class="detail-value">January 6, 2026</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Days Remaining</span>
                <span class="detail-value" style="color: #dc2626;">3 days</span>
              </div>
            </div>
            <p style="font-size: 13px; color: #6b7280;">Please ensure all your action plans are updated before the lock date.</p>
          </div>
          <div class="footer">
            <p>Sent at ${now} &bull; This is a test email from Werkudara Action Plan Tracker</p>
          </div>
        </div>
      </body></html>`;

    case 'critical_alert':
      return `<!DOCTYPE html><html><head>${WERKUDARA_STYLES}</head><body>
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
            <h1>Critical Priority Alert</h1>
            <p>URGENT - Action Required Immediately</p>
          </div>
          <div class="body">
            <p>Hi <strong>Test User</strong>,</p>
            <p>This is a <span class="badge badge-warning">TEST</span> critical priority escalation email.</p>
            <div style="margin: 20px 0; padding: 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
              <p style="margin: 0 0 8px; font-weight: 600; color: #dc2626;">High Priority plans require immediate attention</p>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Priority Level</span>
                <span class="detail-value" style="color: #dc2626;">Ultra High / High</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Lock Date</span>
                <span class="detail-value">January 6, 2026</span>
              </div>
            </div>
            <p style="font-size: 13px; color: #6b7280;">Please take action immediately to avoid missing the deadline.</p>
          </div>
          <div class="footer">
            <p>Sent at ${now} &bull; This is a test email from Werkudara Action Plan Tracker</p>
          </div>
        </div>
      </body></html>`;

    case 'grading_update':
      return `<!DOCTYPE html><html><head>${WERKUDARA_STYLES}</head><body>
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #7c3aed, #6d28d9);">
            <h1>Grading Update</h1>
            <p>Your Action Plan Has Been Verified</p>
          </div>
          <div class="body">
            <p>Hi <strong>Test User</strong>,</p>
            <p>This is a <span class="badge badge-info">TEST</span> grading update email.</p>
            <div style="margin: 20px 0; padding: 16px; background: #f5f3ff; border-radius: 8px; border-left: 4px solid #8b5cf6;">
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Action Plan</span>
                <span class="detail-value">Q1 Budget Review</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Score</span>
                <span class="detail-value" style="color: #059669;">85/100</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Reviewer</span>
                <span class="detail-value">Admin User</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Feedback</span>
                <span class="detail-value">Great work on the documentation!</span>
              </div>
            </div>
            <p style="font-size: 13px; color: #6b7280;">View details in the Action Plan Tracker.</p>
          </div>
          <div class="footer">
            <p>Sent at ${now} &bull; This is a test email from Werkudara Action Plan Tracker</p>
          </div>
        </div>
      </body></html>`;

    case 'auto_lock':
      return `<!DOCTYPE html><html><head>${WERKUDARA_STYLES}</head><body>
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #2563eb, #1d4ed8);">
            <h1>Monthly Lock Applied</h1>
            <p>Period Officially Locked</p>
          </div>
          <div class="body">
            <p>Hi <strong>Test User</strong>,</p>
            <p>This is a <span class="badge badge-info">TEST</span> auto-lock notification email.</p>
            <div style="margin: 20px 0; padding: 16px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Period</span>
                <span class="detail-value">January 2026</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Total Plans</span>
                <span class="detail-value">25</span>
              </div>
              <div class="detail-row" style="border: none;">
                <span class="detail-label">Achieved</span>
                <span class="detail-value" style="color: #059669;">20 (80%)</span>
              </div>
            </div>
            <p style="font-size: 13px; color: #6b7280;">No further edits can be made to this period without admin approval.</p>
          </div>
          <div class="footer">
            <p>Sent at ${now} &bull; This is a test email from Werkudara Action Plan Tracker</p>
          </div>
        </div>
      </body></html>`;

    case 'password_reset':
      return `<!DOCTYPE html><html><head>${WERKUDARA_STYLES}</head><body>
        <div class="container">
          <div class="header">
            <h1>Password Reset</h1>
            <p>Action Plan Tracker - Werkudara Group</p>
          </div>
          <div class="body">
            <p>Hi <strong>Test User</strong>,</p>
            <p>This is a <span class="badge badge-info">TEST</span> password reset email.</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="#" style="display: inline-block; padding: 12px 32px; background: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Reset Password
              </a>
            </div>
            <p style="font-size: 13px; color: #6b7280;">This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>Sent at ${now} &bull; This is a test email from Werkudara Action Plan Tracker</p>
          </div>
        </div>
      </body></html>`;

    default:
      return `<!DOCTYPE html><html><head>${WERKUDARA_STYLES}</head><body>
        <div class="container">
          <div class="header">
            <h1>Test Email</h1>
            <p>Werkudara Group - Action Plan Tracker</p>
          </div>
          <div class="body">
            <p>Hi <strong>Test User</strong>,</p>
            <p>This is a <span class="badge badge-success">TEST</span> email from the Werkudara Action Plan Tracker.</p>
            <p>If you received this, your email configuration is working correctly!</p>
          </div>
          <div class="footer">
            <p>Sent at ${now} &bull; This is a test email</p>
          </div>
        </div>
      </body></html>`;
  }
}

/**
 * Get the subject line for a test email of a specific type.
 */
export function getTestEmailSubject(templateType) {
  const subjects = {
    password_reset: '[TEST] Reset Your Password - Werkudara Group',
    deadline_reminder: '[TEST] Action Plan Deadline Reminder - January 2026',
    critical_alert: '[TEST] URGENT: Critical Action Plan Deadline',
    auto_lock: '[TEST] Monthly Lock Applied - January 2026',
    grading_update: '[TEST] Your Action Plan Has Been Graded',
  };
  return subjects[templateType] || '[TEST] Werkudara Action Plan Tracker';
}
