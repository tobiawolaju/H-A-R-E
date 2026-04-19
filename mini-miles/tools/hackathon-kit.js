/**
 * hackathon-kit.js
 * Generates project boilerplates, READMEs, pitch templates, and pushes to GitHub.
 */

const github = require('./github');

const BOILERPLATES = {
  nextjs: {
    'README.md': (name, desc) => `# ${name}\n\n${desc}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Tech Stack\n- Next.js 14 (App Router)\n- Tailwind CSS\n- TypeScript\n\n## Built for\nHackathon submission\n`,
    'package.json': (name) => JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '0.1.0',
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: { next: '14.0.0', react: '^18', 'react-dom': '^18' },
      devDependencies: { typescript: '^5', '@types/react': '^18', '@types/node': '^20', tailwindcss: '^3' }
    }, null, 2),
    'src/app/page.tsx': (name) => `export default function Home() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center p-24">\n      <h1 className="text-4xl font-bold">${name}</h1>\n      <p className="mt-4 text-gray-500">Built for hackathon</p>\n    </main>\n  );\n}\n`,
  },
  python: {
    'README.md': (name, desc) => `# ${name}\n\n${desc}\n\n## Setup\n\n\`\`\`bash\npip install -r requirements.txt\npython main.py\n\`\`\`\n\n## Tech Stack\n- Python 3.11\n- FastAPI\n- OpenAI / Gemini API\n`,
    'main.py': (name) => `from fastapi import FastAPI\n\napp = FastAPI(title="${name}")\n\n@app.get("/")\ndef root():\n    return {"message": "Hello from ${name}"}\n`,
    'requirements.txt': () => `fastapi\nuvicorn\npython-dotenv\nrequests\n`,
  },
  node: {
    'README.md': (name, desc) => `# ${name}\n\n${desc}\n\n## Setup\n\n\`\`\`bash\nnpm install\nnode index.js\n\`\`\`\n`,
    'index.js': (name) => `const express = require('express');\nconst app = express();\n\napp.get('/', (req, res) => res.json({ message: 'Hello from ${name}' }));\n\napp.listen(3000, () => console.log('${name} running on :3000'));\n`,
    'package.json': (name) => JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      dependencies: { express: '^4.18.0', dotenv: '^16.0.0' }
    }, null, 2),
  }
};

/**
 * Generate a full hackathon project: create a GitHub repo and push all boilerplate files.
 */
async function generateProject({ name, description, stack = 'nextjs', owner = 'tobiawolaju', isPrivate = false }) {
  const template = BOILERPLATES[stack] || BOILERPLATES.nextjs;

  // Create the GitHub repo first
  const repoUrl = await github.createRepo(name, description || `Hackathon project: ${name}`, isPrivate);

  // Build file list
  const files = Object.entries(template).map(([filePath, generator]) => ({
    path: filePath,
    content: generator(name, description)
  }));

  // Push all files in one commit
  await github.editFiles(owner, name, 'main', files, `🚀 Initial hackathon boilerplate: ${stack}`);

  return `✅ Project "${name}" created!\nRepo: ${repoUrl}\nStack: ${stack}\nFiles pushed: ${files.map(f => f.path).join(', ')}`;
}

/**
 * Generate a README.md for an existing project.
 */
function generateReadme({ name, description, stack, features = [], demoUrl = '', teamName = '' }) {
  const featureList = features.length > 0
    ? features.map(f => `- ${f}`).join('\n')
    : '- Core feature 1\n- Core feature 2\n- Core feature 3';

  return `# ${name}\n\n> ${description}\n\n${demoUrl ? `🔗 **Live Demo:** ${demoUrl}\n\n` : ''}## ✨ Features\n${featureList}\n\n## 🛠 Tech Stack\n${stack || 'Next.js, Tailwind CSS, TypeScript'}\n\n## 🚀 Getting Started\n\n\`\`\`bash\ngit clone <repo-url>\nnpm install\nnpm run dev\n\`\`\`\n\n## 👥 Team\n${teamName || 'Solo project'}\n\n---\nBuilt with ❤️ for a hackathon\n`;
}

/**
 * Generate a hackathon pitch template.
 */
function generatePitch({ name, problem, solution, techStack, impact }) {
  return `# ${name} — Hackathon Pitch\n\n## 🔴 Problem\n${problem}\n\n## 💡 Solution\n${solution}\n\n## 🛠 Tech Stack\n${techStack}\n\n## 📈 Impact\n${impact}\n\n## 🏆 Why we win\n- Clear problem/solution fit\n- Working demo\n- Scalable architecture\n`;
}

const STACKS = Object.keys(BOILERPLATES);

module.exports = { generateProject, generateReadme, generatePitch, STACKS };
