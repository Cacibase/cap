const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Enable Puppeteer stealth mode to avoid detection
puppeteer.use(StealthPlugin());

// Function to validate a list of possible URLs dynamically
async function validateLoginUrl(possibleUrls) {
  const browser = await puppeteer.launch({
    headless: true, // Set to false for debugging
    args: ['--ignore-certificate-errors'], // To handle SSL errors
  });
  const page = await browser.newPage();

  try {
    for (const url of possibleUrls) {
      console.log(`Checking URL: ${url}`);
      try {
        // Attempt to navigate to the URL
        await page.goto(url, { waitUntil: 'load', timeout: 10000 });

        // Check if the "Your connection is not private" warning page appears
        if (await page.$('#details-button')) {
          console.log(`Warning page detected for: ${url}`);
          // Click the "Advanced" button
          await page.click('#details-button');
          console.log('Clicked "Advanced" button.');

          // Wait for the "Proceed" link and click it
          if (await page.$('#proceed-link')) {
            console.log(`Bypassing warning for: ${url}`);
            await page.click('#proceed-link');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
          }
        }

        // If the URL loads successfully after bypassing warnings, return it
        console.log(`Valid login URL found: ${url}`);
        return url;
      } catch (error) {
        console.log(`URL check failed for: ${url} - Error: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  // If no valid URL is found, return null
  return null;
}

// Function to dynamically detect the login URL for a custom email domain
async function getDynamicLoginUrl(email) {
  const domain = email.split('@')[1].toLowerCase(); // Extract domain from the email

  // List of possible login URL patterns
  const possibleUrls = [
    `https://mail.${domain}`,          // Common webmail URL
    `https://webmail.${domain}`,       // Alternative webmail URL
    `https://${domain}/login`,         // Login page on the domain
    `https://login.${domain}`,         // Another possible login structure
  ];

  // Validate the possible URLs dynamically
  return await validateLoginUrl(possibleUrls);
}

// Function to clear input fields before typing
async function clearAndType(page, selector, text) {
  // Wait for the input field to appear
  await page.waitForSelector(selector, { visible: true });

  // Focus on the input field
  await page.focus(selector);

  // Clear any existing text in the input field
  await page.evaluate((selector) => {
    const input = document.querySelector(selector);
    if (input) {
      input.value = ''; // Clear the input field
    }
  }, selector);

  // Type the text slowly
  for (const char of text) {
    await page.type(selector, char, { delay: 100 }); // Type character by character
  }
}

// Function to log in to the email account
async function loginToCustomEmail(email, password) {
  // Detect the login URL
  const loginUrl = await getDynamicLoginUrl(email);

  if (!loginUrl) {
    console.error('No valid login URL found!');
    return;
  }

  console.log(`Detected login URL: ${loginUrl}`);

  // Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: false, // Set to false for debugging
    args: ['--ignore-certificate-errors'], // To handle SSL errors
  });
  const page = await browser.newPage();

  try {
    // Navigate to the detected login URL
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });
    console.log(`Navigated to: ${page.url()}`);

    // Clear and type the email
    console.log(`Typing email: ${email}`);
    await clearAndType(page, 'input[type="email"], input[name="email"], input[type="text"]', email);

    // Clear and type the password
    console.log('Typing password...');
    await clearAndType(page, 'input[type="password"]', password);

    // Submit the form (adjust button selector based on your login page)
    console.log('Submitting login form...');
    await page.click('button[type="submit"], input[type="submit"]');

    // Wait for navigation or success indicator
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log('Login successful!');
  } catch (error) {
    console.error('Error during login:', error);
  } finally {
    // Close the browser
    await browser.close();
  }
}

// Example usage
(async () => {
  const email = 'anncutillo@atmc.net'; // Replace with your custom email
  const password = '334';    // Replace with your password

  console.log(`Attempting to log in with email: ${email}`);
  await loginToCustomEmail(email, password);
})();