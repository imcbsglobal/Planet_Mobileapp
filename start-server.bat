@echo off
echo Starting local web server...
echo Open your browser and go to: http://localhost:8000/api-test.html
echo Press Ctrl+C to stop the server
python -m http.server 8000
