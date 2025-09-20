// scenarios/checkout.js
export default async function(page) {
  // Login
  await page.goto("https://mysite.com/login");
  await page.fill("#username", process.env.TEST_USER);
  await page.fill("#password", process.env.TEST_PASS);
  await page.click("button[type=submit]");
  await page.waitForNavigation();

  // Add item to cart
  await page.goto("https://mysite.com/product/sku123");
  await page.click("button.add-to-cart");

  // Navigate to checkout
  await page.goto("https://mysite.com/cart");
  await page.click("button.checkout");
  await page.waitForSelector("button.submit"); // wait until page is ready
}
