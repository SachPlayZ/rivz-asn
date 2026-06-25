// Package email sends transactional emails via SMTP.
package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
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

// Ping verifies SMTP connectivity and authentication at startup.
// Returns an error if connection fails; the caller decides whether to fatal or warn.
func (c *Client) Ping() error {
	cl, err := c.dial()
	if err != nil {
		return fmt.Errorf("email.Ping: %w", err)
	}
	cl.Quit() //nolint:errcheck
	return nil
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

// dial opens an SMTP connection with STARTTLS and authenticates.
// This replaces smtp.SendMail to work correctly with Gmail and providers
// that require explicit TLS on the connection after EHLO.
func (c *Client) dial() (*smtp.Client, error) {
	addr := net.JoinHostPort(c.host, c.port)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("dial tcp %s: %w", addr, err)
	}

	cl, err := smtp.NewClient(conn, c.host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("smtp new client: %w", err)
	}

	// Upgrade to TLS (STARTTLS). Using InsecureSkipVerify=false ensures the
	// server certificate is validated. ServerName must match the SMTP host
	// (e.g. "smtp.gmail.com") — this is the key fix over PlainAuth which
	// uses the host parameter only for credential-sending checks, not TLS SNI.
	tlsCfg := &tls.Config{
		ServerName: c.host,
		MinVersion: tls.VersionTLS12,
	}
	if ok, _ := cl.Extension("STARTTLS"); ok {
		if err := cl.StartTLS(tlsCfg); err != nil {
			cl.Close()
			return nil, fmt.Errorf("starttls: %w", err)
		}
	}

	if c.user != "" {
		auth := smtp.PlainAuth("", c.user, c.pass, c.host)
		if err := cl.Auth(auth); err != nil {
			cl.Close()
			return nil, fmt.Errorf("smtp auth: %w", err)
		}
	}

	return cl, nil
}

func (c *Client) send(to, subject, html string) (retErr error) {
	const maxRetries = 2
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		lastErr = c.sendOnce(to, subject, html)
		if lastErr == nil {
			return nil
		}
		log.Printf("email: send attempt %d failed: %v", attempt+1, lastErr)
	}
	return fmt.Errorf("email: send failed after %d attempts: %w", maxRetries, lastErr)
}

func (c *Client) sendOnce(to, subject, html string) error {
	cl, err := c.dial()
	if err != nil {
		return err
	}
	defer func() {
		cl.Quit() //nolint:errcheck
	}()

	if err := cl.Mail(c.from); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := cl.Rcpt(to); err != nil {
		return fmt.Errorf("RCPT TO: %w", err)
	}

	w, err := cl.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}

	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n%s",
		c.from, to, subject, html,
	)
	if _, err := fmt.Fprint(w, msg); err != nil {
		w.Close()
		return fmt.Errorf("write message: %w", err)
	}
	return w.Close()
}
