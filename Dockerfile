# Lightweight static file server for the camera prompt WebUI
FROM nginx:alpine

# Remove default nginx static content
RUN rm -rf /usr/share/nginx/html/*

# Copy app files
COPY index.html styles.css app.js /usr/share/nginx/html/
COPY vendor /usr/share/nginx/html/vendor

# Expose HTTP port
EXPOSE 80

# nginx runs in foreground by default
CMD ["nginx", "-g", "daemon off;"]
