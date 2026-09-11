from pathlib import Path
p=Path('tests/test-nutricao-integrada.js');s=p.read_text()
old="  await p.locator('#ntpProx').click();ok(await p.locator('#ntpProx').isDisabled(),'Calendário para em hoje');"
new="""  await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),DAY,'Calendário retorna a hoje');
  const antesConsulta=await getRecords(p);
  await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),'2026-09-08','Calendário permite consultar a programação futura');
  ok(!await p.locator('#ntpNovo').isVisible()&&await p.locator('[data-ntp-comi]').count()===0,'Consulta futura não oferece confirmação de consumo');
  eq(await getRecords(p),antesConsulta,'Consultar a programação futura preserva o diário');
  await p.locator('#ntpVoltaHoje').click();eq(await p.locator('#ntpData').inputValue(),DAY,'Voltar a hoje retoma a data dos registros');"""
assert s.count(old)==1;p.write_text(s.replace(old,new))
p=Path('tests/test-nutricao-personal-completa.js');s=p.read_text()
old="  await p.locator('#pnTitulo').fill('Plano com recuperação');"
new="""  ok(await p.locator('[data-pnday="0"][data-pnri="0"]').isVisible(),'Dias da refeição ficam acessíveis no editor');
  await p.locator('[data-pnref="0"][data-pnkey="hora"]').fill('12:45');
  await p.locator('[data-pnday="0"][data-pnri="0"]').uncheck();
  await p.locator('[data-pn-dias-todos="0"]').click();
  eq(await p.locator('[data-pnri="0"][data-pnday]:checked').count(),7,'Todos os dias seleciona a semana inteira');
  eq((await state(p)).nutricaoV1.planos['v814-a'].refeicoes[0].hora,'12:00','Mudar horário permanece rascunho antes de aplicar');
  await p.locator('#pnTitulo').fill('Plano com recuperação');"""
assert s.count(old)==1;s=s.replace(old,new)
old="eq(st.nutricaoV1.planos['v814-a'].refeicoes[0].dias,[1,2,3,4,5,6],'Dias da refeição persistem');"
new=old+"eq(st.nutricaoV1.planos['v814-a'].refeicoes[0].hora,'12:45','Horário escolhido persiste no plano aplicado');"
assert s.count(old)==1;p.write_text(s.replace(old,new))
