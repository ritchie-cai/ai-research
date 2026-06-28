FROM oven/bun:1.3

RUN apt-get update && apt-get install -y \
    curl build-essential python3 && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/opencode/scripts /opt/opencode/skills /opt/opencode/agents

COPY entrypoint.sh /
COPY sidecar.js /opt/opencode/scripts/

RUN chmod +x /entrypoint.sh

WORKDIR /opencode
EXPOSE 19876 19999

CMD ["/entrypoint.sh"]
