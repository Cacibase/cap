const fs = require('fs');
const puppeteer = require('puppeteer');

const progressFile = 'progress.json';
const emailFolder = 'emails'; // Folder to store state-specific email files
let startMainPage = 1; // Start main page
let startSubPage = 1; // Start subpage within each main page

// Load progress if available
if (fs.existsSync(progressFile)) {
    const progressData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    if (progressData) {
        startMainPage = progressData.lastMainPage || startMainPage;
        startSubPage = progressData.lastSubPage || startSubPage;
        console.log(`Resuming from main page ${startMainPage}, subpage ${startSubPage}`);
    }
} else {
    console.log(`Starting from main page ${startMainPage}, subpage ${startSubPage}`);
}

// Ensure the emails folder exists
if (!fs.existsSync(emailFolder)) {
    fs.mkdirSync(emailFolder);
    console.log(`Created folder: ${emailFolder}`);
}

// Helper function to save progress
function saveProgress(mainPage, subPage) {
    fs.writeFileSync(
        progressFile,
        JSON.stringify({ lastMainPage: mainPage, lastSubPage: subPage }),
        'utf8'
    );
}

// Helper function to append email to the corresponding state file
function appendEmailToStateFile(stateAbbreviation, email) {
    const stateFilePath = `${emailFolder}/${stateAbbreviation}.txt`;
    fs.appendFileSync(stateFilePath, `${email}\n`, 'utf8'); // Ensures each email is saved on a new line
    console.log(`Saved email: ${email} to file: ${stateFilePath}`);
}

// Helper function to navigate with retries
async function navigateWithRetry(page, url, maxRetries = 3, timeout = 60000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout });
            return true;
        } catch (error) {
            console.log(`Attempt ${attempt} - Failed to navigate to ${url}: ${error.message}`);
            if (attempt === maxRetries) {
                console.log(`Skipping ${url} after ${maxRetries} attempts`);
                return false;
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// Helper function to wait for navigation with retries
async function waitForNavigationWithRetry(page, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            return true;
        } catch (error) {
            console.log(`Navigation attempt ${attempt} failed: ${error.message}`);
            if (attempt === maxRetries) {
                console.log(`Failed to navigate after ${maxRetries} attempts.`);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

(async function main() {
    while (true) {
        try {
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                protocolTimeout: 120000,
            });
            const page = await browser.newPage();

            // Log in to the site
            await page.goto('https://www.mylife.com/site/login.pubview', { waitUntil: 'networkidle2', timeout: 60000 });
            await page.type('input[name="username"]', 'boggs9131@gmail.com'); // Replace with actual username
            await page.type('input[name="password"]', 'Cactusjack123'); // Replace with actual password
            await page.click('button[type="submit"]');
            

            try {
                // Wait for an element that confirms login (replace '.user-profile-element' with an actual selector)
                await page.waitForSelector('.header-dropdown-avatar', { timeout: 60000 });
                console.log("Logged in successfully");
            } catch (error) {
                console.log("Login confirmation element not found. Taking a screenshot for debugging.");
                await page.screenshot({ path: 'debug_login_failed.png' });
                throw new Error("Login process did not complete successfully.");
            }

            // Navigate to the homepage
            await page.goto('https://www.mylife.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log("Navigated to https://www.mylife.com");
  

            

            const emailFilePath = 'emails.txt';
            const visitedProfiles = new Set();

            const mainPageURL = 'https://www.mylife.com/people-search/e/';
            const totalMainPages = 112;
            const totalSubPages = 196;

            // Main page loop
            for (let mainPage = startMainPage; mainPage <= totalMainPages; mainPage++) {
                const mainPageURLWithIndex = `${mainPageURL}${mainPage}/`;
                console.log(`Navigating to main page URL: ${mainPageURLWithIndex}`);
                if (!(await navigateWithRetry(page, mainPageURLWithIndex))) continue;

                // Subpage loop
                for (let subPage = startSubPage; subPage <= totalSubPages; subPage++) {
                    const subPageURL = `${mainPageURL}${mainPage}/${subPage}/`;
                    console.log(`Navigating to subpage URL: ${subPageURL}`);
                    if (!(await navigateWithRetry(page, subPageURL))) continue;

                    // Save progress for each subpage
                    saveProgress(mainPage, subPage);

                    // Get profile links from the subpage
                    const profileLinks = await page.$$eval('.gl-item-wrap', elements =>
                        elements.map(el => el.href)
                    );

                    if (profileLinks.length === 0) {
                        console.log("No profile links found on this subpage.");
                        continue;
                    }

                    for (const profileURL of profileLinks) {
                        if (visitedProfiles.has(profileURL)) continue;
                        console.log(`Navigating to profile URL: ${profileURL}`);
                        if (!(await navigateWithRetry(page, profileURL))) continue;
                        visitedProfiles.add(profileURL);

                        // Detect if it's not a direct profile page
                        const isDirectProfile = await page.evaluate(() => {
                            return document.querySelector('.name-age-location') === null;
                        });

                        if (!isDirectProfile) {
                            console.log("Not a direct profile page. Iterating through links...");
                            const subProfileLinks = await page.$$eval('.name-age-location a', elements =>
                                elements.map(el => el.href)
                            );

                            for (const subProfileURL of subProfileLinks) {
                                if (visitedProfiles.has(subProfileURL)) continue;
                                console.log(`Navigating to sub-profile URL: ${subProfileURL}`);
                                if (!(await navigateWithRetry(page, subProfileURL))) continue;
                                visitedProfiles.add(subProfileURL);

                                // Extract emails
                                try {
                                    const stateAbbreviation = await page.evaluate(() => {
                                        const locationElement = document.querySelector('.profile-information-location');
                                        if (locationElement) {
                                            const locationText = locationElement.innerText.trim();
                                            const match = locationText.match(/,\s([A-Z]{2})$/); // Matches ", XX" where XX is the state abbreviation
                                            return match ? match[1] : null;
                                        }
                                        return null;
                                    });

                                    if (!stateAbbreviation) {
                                        console.log("State abbreviation not found on this sub-profile.");
                                        continue;
                                    }

                                    const emailSection = await page.$('.master-profile-card-wrapper-email .card-content');
                                    if (emailSection) {
                                        const emails = await page.evaluate(() => {
                                            const emailElements = Array.from(document.querySelectorAll('.master-profile-card-wrapper-email .card-content .block-container'));
                                            return emailElements.map(el => el.innerText.trim());
                                        });
                                        emails.forEach(email => {
                                            if (email) {
                                                appendEmailToStateFile(stateAbbreviation, email);
                                            }
                                        });
                                    } else {
                                        console.log("No email found on this sub-profile.");
                                    }
                                } catch (error) {
                                    console.log(`Error processing sub-profile ${subProfileURL}: ${error.message}`);
                                    continue;
                                }
                            }
                        } else {
                            // Process direct profile page
                            console.log(`Processing direct profile page: ${profileURL}`);
                            try {
                                const stateAbbreviation = await page.evaluate(() => {
                                    const locationElement = document.querySelector('.profile-information-location');
                                    if (locationElement) {
                                        const locationText = locationElement.innerText.trim();
                                        const match = locationText.match(/,\s([A-Z]{2})$/); // Matches ", XX" where XX is the state abbreviation
                                        return match ? match[1] : null;
                                    }
                                    return null;
                                });

                                if (!stateAbbreviation) {
                                    console.log("State abbreviation not found on this profile.");
                                    continue;
                                }

                                const emailSection = await page.$('.master-profile-card-wrapper-email .card-content');
                                if (emailSection) {
                                    const emails = await page.evaluate(() => {
                                        const emailElements = Array.from(document.querySelectorAll('.master-profile-card-wrapper-email .card-content .block-container'));
                                        return emailElements.map(el => el.innerText.trim());
                                    });
                                    emails.forEach(email => {
                                        if (email) {
                                            appendEmailToStateFile(stateAbbreviation, email);
                                        }
                                    });
                                } else {
                                    console.log("No email found on this direct profile.");
                                }
                            } catch (error) {
                                console.log(`Error processing direct profile ${profileURL}: ${error.message}`);
                                continue;
                            }
                        }
                    }
                }
                startSubPage = 1; // Reset subpage counter for the next main page
            }

            await browser.close();
            console.log(`Scraping completed. Emails saved to state-specific files in the emails folder.`);
            break; // Exit loop after successful completion
        } catch (error) {
            console.error("Error during scraping, restarting script:", error);
        }
    }
})();