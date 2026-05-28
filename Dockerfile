FROM node:22-bookworm-slim

WORKDIR /app

ARG APT_MIRROR_HOST=""

RUN set -eux; \
	if [ -n "$APT_MIRROR_HOST" ]; then \
		sed -i \
			-e "s|http://deb.debian.org|http://$APT_MIRROR_HOST|g" \
			-e "s|http://security.debian.org|http://$APT_MIRROR_HOST|g" \
			/etc/apt/sources.list.d/debian.sources; \
	fi; \
	apt-get update \
	&& apt-get install -y --no-install-recommends git curl ca-certificates python3 python3-pip python3-venv python3-cryptography python3-yaml dnsutils \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE 3000

CMD ["npm", "start"]
