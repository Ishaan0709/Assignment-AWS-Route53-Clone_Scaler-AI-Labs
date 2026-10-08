Assignment: AWS Route53 Clone
Objective
Build a functional clone of the AWS Route53 web application with persistent storage and a
backend API. The focus is on recreating the Route53 user experience and core workflows
rather than implementing actual DNS functionality.
Note: Your application should match the original application in terms of UI and UX,
look and feel should be exactly the same.
Tech Stack
Frontend: Next.js (TypeScript)
Backend: FastAPI
Database: SQLite
Scope
Authentication
Implement a simple mocked authentication system.
● Login
● Logout
● Session persistence
IAM, AWS Accounts, Organizations, Billing, and other AWS dependencies can be mocked.
Hosted Zones
Implement full CRUD functionality for Hosted Zones.
Users should be able to:
● View Hosted Zones
● Search Hosted Zones
● Create Hosted Zones
● Edit Hosted Zones
● Delete Hosted Zones
All data must persist in SQLite.
DNS Records
Implement full CRUD functionality for DNS Records within a Hosted Zone.
Support common Route53 record types such as:
● A
● AAAA
● CNAME
● TXT
● MX
● NS
● PTR
● SRV
● CAA
Users should be able to:
● View Records
● Search Records
● Create Records
● Edit Records
● Delete Records
All data must persist in SQLite.
Route53 Experience
The application should closely resemble the AWS Route53 experience, including:
● Navigation structure
● Hosted Zone management
● DNS Record management
● Tables
● Forms
● Search
● Filters
● Pagination
● Modals
● Notifications
The goal is to make the application feel like Route53 rather than a generic CRUD
application.
Mocked Sections
The following sections can be present as placeholders:
● Dashboard
● Traffic Policies
● Health Checks
● Resolver
● Profiles
A simple "Coming Soon" page is sufficient.
Bonus (Optional)
● Import DNS records from BIND zone files
● Export Hosted Zones as JSON or BIND format
● Dark Mode
● Keyboard Shortcuts
● Bulk Operations
Deliverables
Source Code
GitHub repository containing:
● frontend/
● backend/
Documentation
README containing:
● Setup instructions
● Architecture overview
● Database schema
● API overview
Demo: A hosted working link
Evaluation Criteria
● UI similarity to Route53
● Frontend engineering quality
● Backend/API design
● Database design
● Code quality and maintainability
● Documentation
● Overall completeness