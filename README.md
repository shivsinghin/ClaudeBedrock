# Claude Bedrock Chat Interface 🤖

A modern, responsive web-based chat interface powered by Claude 3.5 Sonnet (via AWS Bedrock) that supports text conversations and file analysis.

![Claude Bedrock Chat Interface](public/assets/logo-light.png)

## ✨ Features

- 💬 Real-time chat interface with Claude 3.5 Sonnet
- 📁 File upload support (images, documents)
- 🎨 Beautiful UI with Tailwind CSS
- 📝 Markdown support for responses
- 🖥️ Syntax highlighting for code blocks
- 📱 Fully responsive design
- 💾 Local storage for chat persistence
- 🔄 Auto-reconnection handling

## 🛠️ Tech Stack

- **Frontend:**
  - HTML5
  - Tailwind CSS
  - Vanilla JavaScript
  - Marked.js (Markdown parsing)
  - Highlight.js (Code syntax highlighting)

- **Backend:**
  - Node.js
  - Express.js
  - AWS Bedrock (Claude 3.5 Sonnet)
  - Multer (File handling)

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- AWS Account with Bedrock access
- AWS credentials with appropriate permissions

### Installation

1. Clone the repository:

``` bash
git clone https://github.com/shivsinghin/ClaudeBedrock.git
cd quansys-ai-chat
```

2. Install dependencies:

``` bash
npm install
```

3. Create a `.env` file in the root directory with your AWS credentials:

``` env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
CLAUDE_MODEL_ID=us.anthropic.claude-3-5-sonnet-20241022-v2:0
PORT=3000
```

4. Start the server:

``` bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## 💡 Features in Detail

### Chat Interface
- Clean and intuitive user interface
- Real-time message updates
- Support for markdown formatting
- Code syntax highlighting
- Copy button for code blocks

### File Handling
- Support for multiple file types:
  - Images (.png, .jpg, .jpeg, .gif, .webp)
  - Documents (.pdf, .txt, .doc, .docx)
- Automatic file size validation
- Smart content chunking for large files

### Session Management
- Persistent chat history using localStorage
- Automatic session recovery
- Server restart detection
- Rate limiting protection

## 🔒 Security Features

- File size limitations
- Rate limiting
- Input validation
- Secure file handling
- Environment variable protection

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License

## 📬 Contact

* Website: [shivsingh.com](https://shivsingh.com)
* Email: hi@shivsingh.com
* LinkedIn: [Shiv Singh](https://linkedin.com/in/shivsinghin)