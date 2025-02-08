const HEROKU_URL = "https://frozen-temple-91269-fd7f990b18e5.herokuapp.com"; // Replace with your actual Heroku app URL
const TURNSTILE_SECRET_KEY = "0x4AAAAAAA6n2qpqZzxNKnShKbB4r-lq1iU"; // Get this from your Cloudflare dashboard

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Check if user has already passed Turnstile validation
    const cookies = request.headers.get("Cookie") || "";
    if (cookies.includes("turnstile_passed=true")) {
      return proxyToHeroku(request);
    }

    // If Turnstile validation form is submitted
    if (request.method === "POST" && url.pathname === "/validate-turnstile") {
      const formData = await request.formData();
      const turnstileToken = formData.get("cf-turnstile-response");

      // Verify Turnstile token
      const verificationResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: TURNSTILE_SECRET_KEY,
          response: turnstileToken,
        }),
      });

      const verificationData = await verificationResponse.json();
      if (verificationData.success) {
        // Set a cookie to mark Turnstile verification success
        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": "turnstile_passed=true; Path=/; HttpOnly; Secure; Max-Age=3600",
            "Location": "/", // Redirect to the main page after success
          },
        });
      } else {
        return new Response("Turnstile verification failed. Please try again.", { status: 403 });
      }
    }

    // Serve the Turnstile form if not validated
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Turnstile Verification</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #f4f4f4;
            font-family: Arial, sans-serif;
          }
          .container {
            text-align: center;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.1);
          }
          .cf-turnstile {
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Please verify you are human</h2>
          <form id="turnstile-form" action="/validate-turnstile" method="POST">
            <div class="cf-turnstile" 
                 data-sitekey="0x4AAAAAAA6n2sVAp0He7OUj" 
                 data-callback="onTurnstileSuccess"></div>
            <input type="hidden" name="cf-turnstile-response" id="cf-turnstile-response">
          </form>
        </div>

        <script>
          function onTurnstileSuccess(token) {
            document.getElementById("cf-turnstile-response").value = token;
            document.getElementById("turnstile-form").submit();
          }
        </script>
      </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  },
};

// Function to proxy the request to Heroku
async function proxyToHeroku(request) {
  const url = new URL(request.url);
  url.hostname = HEROKU_URL.replace(/^https?:\/\//, "");

  const modifiedRequest = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return fetch(modifiedRequest);
}
