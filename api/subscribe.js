// Vercel serverless function: POST /api/subscribe
// Sends the 10% code by email (Resend) and saves the contact.
// Env vars (Vercel -> Settings -> Environment Variables):
//   RESEND_API_KEY      (required)  your Resend API key
//   DISCOUNT_CODE       (optional)  coupon code, default: DAW4T5 (must match Sell.app)
//   FROM_EMAIL          (optional)  default: DROB TWEAKS <hello@drobtweaks.com>
//   RESEND_AUDIENCE_ID  (optional)  saves each email into a Resend audience

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function emailHtml(code) {
  return `<!doctype html><html><body style="margin:0;background:#0c0a0e;padding:32px 12px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#14090b;border:1px solid #3a0d0f;border-radius:16px">
<tr><td align="center" style="padding:36px 28px 8px">
<div style="font-size:12px;letter-spacing:4px;color:#ff2a2a">DROB TWEAKS</div>
<div style="font-size:46px;font-weight:800;color:#ffffff;margin:10px 0 4px">10% OFF</div>
<div style="font-size:15px;color:#c8c8d0">Here's your discount code. Use it at checkout on any tool or bundle.</div>
</td></tr>
<tr><td align="center" style="padding:22px 28px">
<div style="display:inline-block;padding:14px 30px;border:2px dashed #e6121a;border-radius:10px;font-size:28px;font-weight:800;letter-spacing:3px;color:#ffffff;background:#1c0a0d">${code}</div>
</td></tr>
<tr><td align="center" style="padding:0 28px 30px">
<a href="https://drobtweaks.sell.app" style="display:inline-block;padding:14px 34px;background:#c40d14;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;letter-spacing:1px">SHOP NOW</a>
<div style="font-size:13px;color:#8b8b96;margin-top:22px">Questions? Join the Discord: <a href="https://discord.gg/cnYkBG5Duy" style="color:#ff2a2a">discord.gg/cnYkBG5Duy</a></div>
</td></tr></table>
<div style="font-size:11px;color:#5a5a63;margin-top:16px">drobtweaks.com</div>
</td></tr></table></body></html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }

  const key = process.env.RESEND_API_KEY;
  const code = process.env.DISCOUNT_CODE || 'DAW4T5';
  if (!key) {
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // honeypot: real people never fill this hidden field
  if (body.website) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ ok: false, error: 'bad_email' });
  }

  const from = process.env.FROM_EMAIL || 'DROB TWEAKS <hello@drobtweaks.com>';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Your 10% off code — DROB TWEAKS',
        html: emailHtml(code),
        text: `Your DROB TWEAKS 10% off code: ${code}\nUse it at checkout: https://drobtweaks.sell.app`,
      }),
    });
    if (!r.ok) {
      console.error('resend send failed', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }
  } catch (e) {
    console.error('resend error', e);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }

  // save the contact (non-fatal if it fails)
  const aud = process.env.RESEND_AUDIENCE_ID;
  if (aud) {
    try {
      await fetch(`https://api.resend.com/audiences/${aud}/contacts`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
    } catch (e) {
      console.error('resend contact error', e);
    }
  }

  return res.status(200).json({ ok: true, code });
};
