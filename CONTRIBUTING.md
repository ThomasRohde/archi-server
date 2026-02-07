# Contributing to ArchiMate Model API Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- A clear, descriptive title
- Steps to reproduce the problem
- Expected vs actual behavior
- Your environment (Archi version, jArchi version, OS)
- Any relevant logs or error messages

### Suggesting Enhancements

Enhancement suggestions are welcome! Please create an issue with:
- A clear description of the feature
- Why it would be useful
- Examples of how it would work
- Any relevant mockups or specifications

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the existing code style** 
   - Use consistent indentation (4 spaces)
   - Add comments for complex logic
   - Follow jArchi/GraalJS best practices
3. **Test your changes** 
   - Verify the server starts correctly
   - Test all affected API endpoints
   - Ensure undo functionality works
4. **Update documentation** 
   - Update README.md if adding features
   - Update openapi.yaml for API changes
   - Add inline code comments
5. **Commit with clear messages**
   - Use present tense ("Add feature" not "Added feature")
   - Include issue references where applicable
6. **Submit the pull request**
   - Describe what changes you made and why
   - Link to any related issues

## Development Setup

1. Clone the repository to your Archi scripts directory
2. Open an Archi model and view
3. Run "Model API Server" from the Scripts menu
4. Make changes to the code
5. Restart the server to test changes

## Code Structure

- `scripts/Model API Server.ajs` - Main entry point
- `scripts/lib/core/` - Core infrastructure (requires, undo)
- `scripts/lib/server/` - Server implementation
- `scripts/lib/server/endpoints/` - Modular API endpoints
- `context/` - Development documentation

## Testing

Manual testing checklist:
- [ ] Server starts without errors
- [ ] Monitor UI displays correctly
- [ ] `/health` endpoint responds
- [ ] Model queries return correct data
- [ ] Model modifications work and are undoable (Ctrl+Z)
- [ ] View creation and layout works
- [ ] Rate limiting activates correctly
- [ ] Server shutdown is clean

## Questions?

Feel free to ask questions by creating an issue or starting a discussion on the Archi forum.

## Code of Conduct

Be respectful, constructive, and professional in all interactions.

---

Thank you for contributing! 🎉
