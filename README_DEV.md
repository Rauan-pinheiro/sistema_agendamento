# Projeto: SaaS de Agendamento Multi-Tenant

## 1. Visão Geral
Este é um sistema SaaS (Software as a Service) focado em prestadores de serviços (barbearias, clínicas, etc.). O objetivo principal é permitir que cada assinante tenha seu próprio ambiente isolado para gestão de horários, serviços e clientes.

## 2. Arquitetura e Stack
- **Backend:** Python / Django (Foco em escalabilidade e segurança).
- **Banco de Dados:** MySQL (Hospedado via Railway).
- **Frontend:** React (Consumindo API via Django Rest Framework).
- **Infra:** Deploy principal na plataforma Railway.
- **Estratégia de Produto:** Web-First (Mobile e Desktop em planos futuros).

## 3. Estrutura Multi-Tenant (Isolamento de Dados)
- O sistema utiliza **Isolamento via Chave Estrangeira** (Shared Database, Isolated Rows).
- O model `Empresa` é o "Tenant" (inquilino).
- Quase todos os outros models herdam de `BaseModel`, que contém uma `ForeignKey` obrigatória para `Empresa`.
- **Links Personalizados:** Cada empresa possui um `slug` para gerar sua própria página pública de agendamentos.

## 4. Models Principais (App: core)
- **Empresa:** Vinculada a um User (Owner), contém nome, slug e contato.
- **Servico:** Nome, duração em minutos e preço.
- **Agendamento:** Relaciona cliente, serviço, data/hora e status (pendente, confirmado, cancelado).

## 5. Fluxos de Usuário
1. **Área do Assinante (Dashboard):** Autenticada, onde o prestador gerencia seu negócio.
2. **Área do Cliente (Public):** Acessada via `slug`. Permite ao cliente final visualizar serviços de uma empresa específica e solicitar agendamentos sem necessidade de login complexo.

## 6. Próximos Objetivos de Desenvolvimento
- [ ] Implementação de API Endpoints (Django Rest Framework).
- [ ] Lógica de filtragem automática por Tenant (Global Filter/Middleware).
- [ ] Integração com Frontend React.