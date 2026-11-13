// Fictional documents for the standalone educational showroom.
// Every record is authored for demonstration: not a crawl result or customer data.
export const scenarios = Object.freeze({
  support: {
    id:"support",title:"Support website",subtitle:"A small public-facing help center",
    sourceType:"website",profile:"website",url:"https://help.example.com/",namespace:"customer_support",
    defaultQuery:"How can I reset my password?",
    pages:[
      {path:"/start",title:"Getting started",body:[
        ["Getting started","Create an account with your email address and confirm it using the verification link."],
        ["First login","After verification, open your workspace and sign in with the credentials you created."],
        ["Navigation","The dashboard includes account settings, team access, and billing information."]
      ]},
      {path:"/account",title:"Account and security",body:[
        ["Reset your password","Open Account settings, select Reset password, and follow the email verification link. The link expires after a short period."],
        ["Two-factor authentication","Enable two-factor authentication in Security settings to protect your account. Store the recovery codes securely."],
        ["Email changes","To update the login email, verify both the previous address and the new address."]
      ]},
      {path:"/billing",title:"Billing and invoices",body:[
        ["Download invoices","Open Billing, choose an invoice, and download the corresponding receipt."],
        ["Payment methods","Account owners can change the card used for future invoices."],
        ["Billing contacts","Set a billing contact to receive notifications about invoices and payments."]
      ]}
    ]
  },
  repository: {
    id:"repository",title:"Repository documentation",subtitle:"Documentation acquired as an explicit GitHub repository profile",
    sourceType:"website",profile:"github-repository",url:"https://github.com/example/sample-sdk",namespace:"sdk_docs",
    defaultQuery:"How are API keys configured?",
    pages:[
      {path:"/README.md",title:"README.md",body:[
        ["Sample SDK","This repository contains an example SDK, reference documentation, and runnable examples."],
        ["Quick start","Install the SDK locally, create a client, and configure the endpoint for your environment."],
        ["Documentation map","The docs folder contains installation, authentication, and error-handling guidance."]
      ]},
      {path:"/docs/authentication.md",title:"docs/authentication.md",body:[
        ["Authentication","Create an API key in the dashboard and pass it through the SDK configuration."],
        ["Key storage","Keep API keys in environment variables or a trusted secret manager. Never commit credentials into a repository."],
        ["Rotation","Rotate API keys periodically and revoke compromised keys."]
      ]},
      {path:"/docs/errors.md",title:"docs/errors.md",body:[
        ["Errors and retries","Requests can fail with rate limits or temporary network errors."],
        ["Backoff","Use exponential backoff for retryable failures and stop after the configured attempt limit."],
        ["Diagnostics","Log request identifiers, response status codes, and relevant timings without logging secrets."]
      ]}
    ]
  }
});
