# Corrigir leitura de documentos autenticados

## Objetivo
Garantir que um ficheiro carregado por uma conta fica realmente guardado e pode ser aberto apenas por essa mesma conta.

## Alterações
- Usar o caminho canónico devolvido pelo armazenamento e confirmá-lo antes de criar o registo do documento.
- Verificar imediatamente a leitura do ficheiro após o upload; se falhar, não apresentar o carregamento como concluído.
- Abrir PDFs e imagens através de uma transferência autenticada para uma URL local temporária, evitando falhas de URLs assinadas no visualizador.
- Libertar essas URLs temporárias ao fechar e apresentar mensagens acionáveis para sessão expirada, acesso negado, ficheiro ausente ou falha de rede.
- Manter as políticas atuais de isolamento por primeira pasta da conta e validar bucket, MIME e associação entre registo e objeto.

## Verificação
- Confirmar estrutura e políticas reais do armazenamento e base de dados.
- Testar upload e abertura autenticados se existir sessão disponível; caso contrário, validar o fluxo automatizado possível e indicar explicitamente a limitação.
- Confirmar compilação e ausência de erros no preview.
