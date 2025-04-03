# TallyfyAI Electron Proof of Concept

This is a proof of concept for converting the TallyfyAI Python application to Electron.

## Features

- Login with AWS Cognito (mocked in this POC)
- Main dashboard interface
- Database connection testing (mocked in this POC)
- Cross-platform compatibility
- Automatic updates via GitHub Releases
- GitHub Actions for CI/CD

## Project Structure

```
electron-poc/
├── main.js                # Main Electron process
├── preload.js             # Preload script for secure IPC 
├── package.json           # Project configuration
├── .env                   # Environment variables
├── .github/
│   └── workflows/
│       └── build.yml      # GitHub Actions workflow
├── src/
│   ├── main/              # Main process modules
│   │   ├── auth.js        # Authentication module
│   │   └── db.js          # Database module
│   ├── renderer/          # Renderer process files
│   │   ├── index.html     # Main application window
│   │   ├── login.html     # Login window
│   │   ├── css/
│   │   │   └── styles.css # Custom styles
│   │   └── js/
│   │       ├── app.js     # Main app JS
│   │       └── login.js   # Login JS
│   └── assets/            # Application assets
└── resources/             # Build resources
    └── icons/             # Application icons
```

## Getting Started

### Prerequisites

- Node.js 14+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file (sample provided)

### Development

Start the application in development mode:

```bash
npm run dev
```

### Building

Build the application for production:

```bash
npm run build
```

This will create platform-specific distributables in the `dist` folder.

## CI/CD with GitHub Actions

This project includes a GitHub Actions workflow that:

1. Builds the application on Windows, macOS, and Linux
2. Creates platform-specific installers
3. Creates GitHub releases when tags are pushed
4. Uploads built artifacts to the release

To create a new release:

1. Update the version in `package.json`
2. Commit your changes
3. Create and push a new tag following semver (e.g., `v1.0.1`)
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. GitHub Actions will build and publish the release automatically

## Auto-Update System

This application includes an auto-update system that:

1. Checks for updates when the app starts
2. Allows users to manually check for updates
3. Downloads updates in the background
4. Prompts users to install when updates are ready

The update system uses GitHub Releases as the distribution channel. When a new version is published, users will receive a notification and can update with a single click.

## Technologies Used

- Electron - Cross-platform desktop framework
- Bootstrap - UI framework
- AWS SDK - For Cognito authentication
- PostgreSQL client - For database connections
- electron-updater - For automatic updates
- GitHub Actions - For CI/CD

## Notes

This is a proof of concept and not a complete application. It demonstrates the basic structure and functionality that would be required for a full conversion of the TallyfyAI Python application to Electron.

In a production version, the following would need to be implemented:

1. Full AWS Cognito integration
2. Actual PostgreSQL database connections
3. Tally API integration
4. Complete UI implementation of all application features
5. Proper error handling and logging
6. Automated testing

## License

This project is proprietary and confidential. All rights reserved. 