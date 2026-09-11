from pathlib import Path
import gzip, hashlib, subprocess

# Patch local revisado contra a main 81a912a. Recusa qualquer base divergente.
before = {
 'app/aluno-builder.js':'17d32ed3b55834de414f44ca9ba9f1e4afcfb978',
 'app/aluno-skin.js':'018c0e0bab04d5dda479ccffc6764b5fd3ca75ef',
 'app/app-sw.js':'42d07b11d6ecad13b3b90b41fbf25b8e9c589dbb',
 'assets/personal-nutricao.js':'920dfaae0048f9fa8eb318f3cbc84e3d55177cc5',
 'assets/versao.js':'ae4c3bc7140f8bb321b4242bec487729a6d621f7',
 'sw.js':'df5c694b7475250679cf09ae328c11059993f9de',
 'tests/test-aluno-evolucao-experiencia.js':'fed38342ffb58dad37548631318d80afc4ecbb42',
 'tests/test-nutricao-integrada.js':'4d36f0044720eb8d488146710035cb32b84b726a',
}
after = {
 'app/aluno-builder.js':'e646efbb137b98ac57b9cb41d9448ae4043e09f9',
 'app/aluno-skin.js':'4080b01d0361c57fddf48c9d322b96fbd9e905a9',
 'app/app-sw.js':'f74d61c3540d978c6de4f34868a01b607f3c77d8',
 'assets/personal-nutricao.js':'53b622e97fbe84239c3280c777cf5b41f426e26c',
 'assets/versao.js':'077201a9abdd2236f535f24340e1fe6663fd1e93',
 'sw.js':'e682b544378a330160aa61fcbee376f072411ed9',
 'tests/test-aluno-evolucao-experiencia.js':'bb90ac06aec341400a0d0e0bddc72e17caf1cc5f',
 'tests/test-calendario-alimentacao-editor.js':'f3b72dc64b70d0ff8937436f58b4e1f6e828558c',
 'tests/test-calendario-alimentacao.js':'ed6a445d9f76f0fe333b932ab43929ff61ec7675',
 'design/ALIMENTACAO-CALENDARIO-V821.md':'496897098d993ac3219fd1a747da53a73b4aba32',
 'tests/test-nutricao-integrada.js':'d0177e0289b1ec92502ecb7e5ff8a800617ac5c1',
}
def sha(data):
 return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
for name, expected in before.items():
 assert sha(Path(name).read_bytes()) == expected, 'Base divergente: '+name
for name in set(after)-set(before):
 assert not Path(name).exists(), 'Novo arquivo ja existe: '+name
packed=Path('tools/calendar-v821.patch.gz').read_bytes()
assert hashlib.sha256(packed).hexdigest()=='71afd1de9cea60648b1927c51b17e3b2dbe0d2807877eed78dc3bd3dfb55ae77'
patch=Path('/tmp/calendar-v821.patch'); patch.write_bytes(gzip.decompress(packed))
subprocess.run(['git','apply','--unidiff-zero','--check',str(patch)],check=True)
subprocess.run(['git','apply','--unidiff-zero',str(patch)],check=True)
# A consulta agora admite futuro; o registro continua limitado ao dia atual.
p=Path('tests/test-nutricao-integrada.js'); s=p.read_text()
old="  await p.locator('#ntpProx').click();ok(await p.locator('#ntpProx').isDisabled(),'Calendário para em hoje');"
new="""  await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),DAY,'Volta ao dia atual');
  const antesFuturo=await getRecords(p);
  await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),'2026-09-08','Calendário permite consultar plano futuro');
  ok(await p.locator('#ntpNovo').isDisabled(),'Consulta futura não permite registrar consumo');
  eq(await p.locator('[data-ntp-comi]').count(),0,'Plano futuro não oferece confirmação de consumo');
  eq(await getRecords(p),antesFuturo,'Consultar o futuro não modifica os registros existentes');
  await p.locator('#ntpVoltaHoje').click();"""
assert s.count(old)==1
p.write_text(s.replace(old,new))
for name,expected in after.items():
 assert sha(Path(name).read_bytes()) == expected, 'Saida divergente: '+name
 print('OK integridade:',name)
