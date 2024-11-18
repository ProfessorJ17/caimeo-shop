const fs = require('fs');
const axios = require('axios');
const atob = require('atob');
const btoa = require('btoa');

// GitHub repository details
const repoOwner = 'your-username';
const repoName = 'your-repo-name';
const fileName = 'highscores.json';
const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${fileName}`;

// GitHub API Token (GitHub automatically sets the GITHUB_TOKEN in Actions environment)
const token = process.env.GITHUB_TOKEN;

// Fetch high scores from GitHub
async function fetchHighScores() {
  try {
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `token ${token}`
      }
    });

    const content = atob(response.data.content); // Decode base64
    const highScores = JSON.parse(content);
    return highScores;
  } catch (error) {
    console.error('Error fetching high scores:', error);
    return [];
  }
}

// Update high scores with new data (this can be customized)
async function updateHighScores() {
  const newScore = { username: "Player4", score: 70 }; // Example new score
  const highScores = await fetchHighScores();

  highScores.push(newScore); // Add new score
  highScores.sort((a, b) => b.score - a.score); // Sort by score (highest first)

  const updatedContent = btoa(JSON.stringify(highScores)); // Convert to base64
  await pushHighScores(updatedContent);
}

// Push the updated high scores to GitHub
async function pushHighScores(updatedContent) {
  try {
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `token ${token}`
      }
    });

    const sha = response.data.sha; // Get the SHA of the current file

    await axios.put(apiUrl, {
      message: 'Update high scores',
      content: updatedContent,
      sha: sha
    }, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('High scores updated successfully');
  } catch (error) {
    console.error('Error updating high scores:', error);
  }
}

// Run the update
updateHighScores();
