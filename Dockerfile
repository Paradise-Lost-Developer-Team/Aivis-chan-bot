FROM nginx:alpine

# Astroビルド成果物をnginx公開ディレクトリにコピー
COPY ./far-field/dist/ /usr/share/nginx/html/

# 静的リソースも必要に応じてコピー
COPY ./images /usr/share/nginx/html/images
COPY ./voice_lines /usr/share/nginx/html/voice_lines
COPY ./css /usr/share/nginx/html/css
COPY ./faq /usr/share/nginx/html/faq
COPY ./terms /usr/share/nginx/html/terms
COPY ./privacy /usr/share/nginx/html/privacy
COPY ./docs /usr/share/nginx/html/docs

EXPOSE 80