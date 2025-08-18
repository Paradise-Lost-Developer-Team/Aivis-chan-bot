FROM nginx:alpine

# すべてのhtmlファイルをnginx公開ディレクトリにコピー
COPY ./*.html /usr/share/nginx/html/

COPY ./css /usr/share/nginx/html/css
COPY ./js /usr/share/nginx/html/js
COPY ./images /usr/share/nginx/html/images
COPY ./voice_lines /usr/share/nginx/html/voice_lines

EXPOSE 80
COPY ./faq /usr/share/nginx/html/faq
COPY ./terms /usr/share/nginx/html/terms
COPY ./privacy /usr/share/nginx/html/privacy
COPY ./docs /usr/share/nginx/html/docs