import type { ResolvedAction } from "@/server/engine/replay/types";

// A compiled script exercising every action and assertion kind, for the export golden file.

export const checkoutSteps = [
  { action: "Log in", expected: "Signed in" },
  { action: "Open the cart", expected: "Cart page is shown" },
  { action: "Enter the coupon code", expected: "Coupon field is filled" },
  { action: "Enter the card holder", expected: "Name is filled" },
  { action: "Choose express shipping", expected: "Express is selected" },
  { action: "Press Enter to apply", expected: "Coupon applied" },
  { action: "Hover the total", expected: "Breakdown tooltip appears" },
  { action: "Scroll to the summary", expected: "Summary visible" },
  { action: "Place the order", expected: "Order confirmation page" },
  { action: "Check the order count", expected: "One order listed" },
  { action: "Check the receipt link", expected: "Receipt points at the PDF" },
];

const at = (urlPattern: string) => ({ urlPattern });

export const checkoutActions: ResolvedAction[] = [
  { stepIndex: 0, action: "skip_auth", pre: at("/"), post: at("/") },
  {
    stepIndex: 1, action: "navigate", url: "/cart?ref=email", pre: at("/"),
    post: { urlPattern: "/cart", assertion: { type: "url_matches", expected: "/cart" } },
  },
  {
    stepIndex: 2, action: "fill", valueRef: "{{credential:COUPON_CODE}}",
    locators: { css: "#coupon", role: { role: "textbox", name: "Coupon code" } },
    pre: at("/cart"), post: { urlPattern: "/cart", assertion: { type: "visible", expected: "Coupon code" } },
  },
  {
    stepIndex: 3, action: "fill", valueRef: "Ada {{credential:TEST_LAST_NAME}}",
    locators: { testId: "card-holder", css: "input[name=\"holder\"]" },
    pre: at("/cart"), post: { urlPattern: "/cart", assertion: { type: "element_exists", expected: "x", selector: "input[name=\"holder\"]" } },
  },
  {
    stepIndex: 4, action: "select", valueRef: "express", locators: { css: "#shipping" },
    pre: at("/cart"), post: { urlPattern: "/cart", assertion: { type: "attribute_equals", expected: "express", selector: "#shipping", attribute: "data-value" } },
  },
  {
    stepIndex: 5, action: "press_key", valueRef: "Enter",
    pre: at("/cart"), post: { urlPattern: "/cart", assertion: { type: "text_contains", expected: "Coupon \"SPRING\" applied" } },
  },
  {
    stepIndex: 6, action: "hover", locators: { text: "Total" },
    pre: at("/cart"), post: { urlPattern: "/cart", assertion: { type: "visible", expected: "Subtotal" } },
  },
  {
    stepIndex: 7, action: "scroll",
    pre: at("/cart"), post: { urlPattern: "/cart", assertion: { type: "accessibility_check", expected: "ok", selector: "#summary" } },
  },
  {
    stepIndex: 8, action: "click", locators: { role: { role: "button", name: "Place order" }, testId: "place-order", css: "#place" },
    pre: at("/cart"), post: { urlPattern: "/orders/*", assertion: { type: "url_matches", expected: "/orders/" } },
  },
  {
    stepIndex: 9, action: "assert",
    pre: at("/orders/*"), post: { urlPattern: "/orders/*", assertion: { type: "element_count", expected: "1", selector: "li.order" } },
  },
  {
    stepIndex: 10, action: "assert",
    pre: at("/orders/*"), post: { urlPattern: "/orders/*", assertion: { type: "attribute_equals", expected: "/r/1.pdf", selector: "a.receipt", attribute: "href" } },
  },
];
