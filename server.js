const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
const PORT = 3000;

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Serve the login form
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login Automation</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 2rem auto;
            max-width: 500px;
            text-align: center;
          }
          form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          input, button {
            padding: 0.5rem;
            font-size: 1rem;
          }
          button {
            background-color: #007bff;
            color: #fff;
            border: none;
            cursor: pointer;
          }
          button:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <h1>Login Automation</h1>
        <form action="/submit-login" method="POST">
          <label>
            Username:
            <input type="text" name="username" required />
          </label>
          <label>
            Password:
            <input type="password" name="password" required />
          </label>
          <button type="submit">Submit</button>
        </form>
      </body>
    </html>
  `);
});

// Handle login form submission
app.post("/submit-login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: false, // Make this false to see the browser
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Navigate to the login page
    await page.goto("https://verified.capitalone.com/auth/pathFinder", { waitUntil: "networkidle2" });

    // Type the username and password
    console.log(`Typing username: ${username}`);
    await page.type('input[data-testtarget="username-usernameInputField"]', username);

    console.log(`Typing password: ${password}`);
    await page.type('input#pwInputField', password);

    // Click the "Sign In" button
    console.log("Clicking the 'Sign In' button...");
    await page.click('[data-testtarget="sign-in-submit-button"]');

    // Wait for 5 seconds (use setTimeout if waitForTimeout is not available)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check for the success element
    const elementExists = await page.evaluate(() => {
      const element = document.querySelector('[data-testtarget="headerText"]');
      return element !== null;
    });

    // Close browser
    await browser.close();

    // Respond based on the result
    if (elementExists) {
      res.send("<h1>Login Successful! We noticed something different about this sign in.</h1>");
    } else {
      res.send("<h1>Login Failed: Invalid username or password.</h1>");
    }
  } catch (error) {
    console.error("Error during Puppeteer session:", error);
    res.status(500).send("<h1>An error occurred while processing your request.</h1>");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});