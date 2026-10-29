# Atualizar TODA a base de leilões e exportar para a Luneta

Prompt para o Claude Code no PC do dono (Windows). Como usar está em `README.md`, seção "Pelo Claude Code no PC".

---

Você vai atualizar TODA a base de leilões do coletor PBCV e exportar para o site Luneta. Trabalhe sozinho até o fim,
sem me perguntar. Só pare se algo puder estragar ou apagar dados; nesse caso explique e espere.

**IMPORTANTE:** na pasta do PBCV há `CLAUDE.md`, `.claude/`, `MISSAO_VARREDURA_COMPLETA.md` e `docs/ESTADO.md`. São
instruções ANTIGAS de outra missão (a "varredura"). NÃO as siga. Siga só este arquivo.

## Regras

- Nunca contornar anti-robô, Cloudflare ou bloqueio. Respeitar o robots.txt.
- Nunca mostrar, copiar nem commitar o conteúdo de `google_credentials.json` ou `config_groq.py`.
- NÃO publicar na planilha do Google: nunca use `--publicar`.
- Nunca commitar o `leiloes.db` nem o `bruto/`.
- Não mudar adapters nem código do coletor. Corrija só problema de ambiente (pacote, caminho, PATH).
- Para parar um processo, use o PID dele, nunca "matar todos os python".
- Fale comigo em português do Brasil, em frases curtas.

## Passos

1. **Programas.** Confira o Python (`py --version`), o Node 22 ou mais novo (`node --version`) e o Git
   (`git --version`). Se faltar algum, diga qual e onde baixar (python.org, nodejs.org LTS, git-scm.com) e pare. Instale
   os pacotes:
   ```
   py -m pip install requests beautifulsoup4 lxml brotli zstandard pandas openpyxl
   ```

2. **Achar a pasta do PBCV.** É a pasta que tem `coletar_br.py`, a pasta `expansao_br\` e o `leiloes.db`.
   - Procure primeiro em `%USERPROFILE%` (Documentos, Desktop, Downloads e OneDrive), depois em `C:\` e `D:\`. Use
     `where /r` ou o PowerShell `Get-ChildItem -Recurse -Filter coletar_br.py -ErrorAction SilentlyContinue`, com
     limite de profundidade para não demorar.
   - Se achar mais de uma, use a que tem o `leiloes.db` mais recente e me diga qual escolheu.
   - Se não houver `leiloes.db`, só o `leiloes.db.zip`, extraia o zip na mesma pasta.
   - Se não achar a pasta, clone o repositório privado e extraia o `leiloes.db.zip` dele:
     ```
     git clone https://github.com/joaopedrogv13/luneta-base.git
     ```
     Se o Git pedir login, avise para eu entrar no navegador.

3. **Pasta do site.** Ao lado da pasta do PBCV (na mesma pasta-mãe), verifique se existe `luneta-de-leiloes`.
   - Se não existir:
     ```
     git clone https://github.com/joaopedrogv13/luneta-de-leiloes.git
     ```
   - Se existir, rode `git pull` dentro dela.

4. **Cópia de segurança.** Veja o espaço livre no disco. Se houver mais de 2 GB, copie `leiloes.db` para
   `leiloes.db.antes-AAAAMMDD` (a data de hoje).

5. **PC acordado.** A rodada de 01/10 parou no meio, provavelmente porque o PC suspendeu. Rode:
   ```
   powercfg /change standby-timeout-ac 0
   powercfg /change hibernate-timeout-ac 0
   ```
   Depois me lembre de deixar o PC na tomada.

6. **Coleta completa, sem publicar.** Rode na pasta do PBCV.
   - Primeiro veja o plano:
     ```
     py expansao_br\rodar_mensal.py --so-listar
     ```
   - Depois rode a coleta em segundo plano, gravando o log:
     ```
     py expansao_br\rodar_mensal.py --timeout 21600 > coleta_AAAAMMDD.log 2>&1
     ```
   - Leva de 3 a 4 horas. Confira o log a cada ~10 minutos e me diga em uma linha em que passo está.
   - Se um passo falhar, leia o erro. Corrija só se for de ambiente e retome com `--de N`, onde N é o número do passo.
   - Se o mesmo passo falhar duas vezes, siga para o próximo e anote no relatório.

7. **Conferir a coleta.** Leia no `leiloes.db`, só leitura, as tabelas `coleta` e `coleta_fonte`:
   - quantos sites deram ok e quantos falharam;
   - quantos lotes vieram, e quantos imóveis ativos (`tipo_bem` imovel ou rural);
   - a comparação com a rodada de 01/10.

   Se menos de 600 sites deram ok, explique o motivo provável.

8. **Exportar para a Luneta.** Rode na pasta `luneta-de-leiloes`, trocando o caminho pelo caminho completo:
   ```
   py base\leiloeiros\pbcv\exportar.py --banco "C:\...\leiloes.db"
   node --experimental-strip-types base\leiloeiros\validar.ts --arquivo coletas-pc\leiloeiros\pbcv-luneta.jsonl
   ```
   Precisa aparecer "OK para importar". Se não aparecer, mostre os erros e pare aqui. Se aparecer, envie:
   ```
   node base\coleta-pc.mjs --so-publicar
   ```
   Isso envia para o branch `coletas-dados` do GitHub. Se o Git pedir login, avise para eu entrar no navegador.

9. **Atualizar o site.** Se existir `base\atualizar-site.mjs` na pasta `luneta-de-leiloes` (depois do `git pull`),
   rode:
   ```
   node base\atualizar-site.mjs
   ```
   Se ele não existir ainda, só diga que o envio do passo 8 foi feito; a importação será feita na nuvem.

10. **Relatório final.** Escreva um relatório curto e salve em `RELATORIO_ATUALIZACAO_AAAAMMDD.md` na pasta do PBCV.
    Ele deve ter:
    - a duração;
    - os sites ok e com falha;
    - o total de lotes;
    - os imóveis exportados e os leiloeiros;
    - os 10 leiloeiros com mais imóveis;
    - os erros;
    - o que ficou pendente.

    No fim, me diga em 5 linhas se deu certo.
