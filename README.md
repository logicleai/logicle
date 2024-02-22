<h1 align="center" style="border-bottom: none">
    <div>
        <a href="https://logicle.ai">
            <img src="./logicle/public/logo.png" width="90" />
            <br>
            Logicle
        </a>
    </div>
    The Open Source ChatGPT Enterprise Alternative <br>
</h1>

## ⭐️ Why Logicle?
Logicle was created to enable companies of all sizes to adopt Generative AI with no initial investment and total flexibility.
Our platform is built for full extensibility, allowing seamless integration with any company system CRM, legacy ERP, or custom software and compatibility with any commercial and open-source LLM provider, ensuring your company data remains free from vendor lock-in.


## ✨ Features

- **👥 Enhanced Multi-User Access**: Streamline onboarding with multi-user support, featuring dual-level authorization for users and admins.

- **🔗 SSO Integration**: Easily integrate with leading Enterprise SSO providers (Microsoft Entra ID, Okta, ADFS, Auth0, Google Workspace SSO), supporting OIDC and SAML 2.0.

- **⚙️ Simplified Configuration**: Quickly customize settings via a user-friendly admin UI for effortless setup and integration.

- **🔒 Security**: Integrate seamlessly with open-source inference servers like Ollama and Local.ai, enabling secure AI services even in air-gapped environments.

- **🛢️ Database Flexibility**: Choose between SQLite for small-scale use and Postgres for enterprise deployments.

- **🤖 Custom AI Assistants**: Deploy specialized AI assistants with tailored knowledge for precise task execution.

## 🚀 Quick try

### Docker

```bash
docker run -d --name logicle \
-p 3000:3000 \
ghcr.io/logicleai/logicle:latest
```

Than just go to [localhost:3000](http://localhost:3000) and create an account


## License

<p>
This project is licensed under <a href="./LICENSE">AGPLv3</a>.
</p>