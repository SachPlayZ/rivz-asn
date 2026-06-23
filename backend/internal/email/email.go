// Package email sends transactional emails via SMTP.
package email

import (
	"fmt"
	"net/smtp"
)

// Client sends email via SMTP.
type Client struct {
	host string
	port string
	user string
	pass string
	from string
}

// New creates an SMTP email client.
func New(host, port, user, pass, from string) *Client {
	return &Client{
		host: host,
		port: port,
		user: user,
		pass: pass,
		from: from,
	}
}

// SendVerification sends an email verification link to the given address.
func (c *Client) SendVerification(to, verifyURL string) error {
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;padding:40px 0;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px">Verify your email</h1>
    <p style="color:#6b7280;margin:0 0 28px;line-height:1.5">
      Click the button below to verify your email address and activate your account.
      The link expires in 24 hours.
    </p>
    <a href="%s"
       style="display:inline-block;background:#000;color:#fff;text-decoration:none;
              padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
      Verify Email
    </a>
    <p style="margin:28px 0 0;font-size:12px;color:#9ca3af">
      If you didn't create an account you can safely ignore this email.
    </p>
  </div>
</body>
</html>`, verifyURL)

	return c.send(to, "Verify your email address", html)
}

// SendNotification emails a single notification with an optional deep link.
func (c *Client) SendNotification(to, title, body, url string) error {
	btn := ""
	if url != "" {
		btn = fmt.Sprintf(`<a href="%s" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;margin-top:20px">Open in Fayde</a>`, url)
	}
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;padding:40px 0;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 8px">%s</h1>
    <p style="color:#374151;margin:0;line-height:1.5">%s</p>
    %s
    <p style="margin:28px 0 0;font-size:12px;color:#9ca3af">Manage notification settings in Fayde to change how you're notified.</p>
  </div>
</body>
</html>`, title, body, btn)

	return c.send(to, title, html)
}

func (c *Client) send(to, subject, html string) error {
	var auth smtp.Auth
	if c.user != "" {
		auth = smtp.PlainAuth("", c.user, c.pass, c.host)
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n%s",
		c.from, to, subject, html)
	addr := fmt.Sprintf("%s:%s", c.host, c.port)
	return smtp.SendMail(addr, auth, c.from, []string{to}, []byte(msg))
}
