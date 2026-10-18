package com.torqueon.health
import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class HealthRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = TextView(this)
        text.setPadding(32, 48, 32, 32)
        text.textSize = 18f
        text.text = "TORQUE ON Aluno\n\nVocê escolhe quais dados de saúde serão lidos: treinos, passos ou sono. Não gravamos dados no Health Connect. A leitura só acontece quando você toca em Sincronizar no app.\n\nOs dados alimentam seu acompanhamento com o profissional. Você pode desconectar e apagar a cópia local pelo app ou retirar permissões no Health Connect. Treinos já importados permanecem no histórico até você removê-los.\n\nPolítica de privacidade: https://www.torqueon.com.br/privacidade.html"
        setContentView(text)
    }
}
