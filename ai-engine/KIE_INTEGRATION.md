# Kie.ai Integration - Nano Banana Pro

## Implementación Completada

### 1. Kie.ai Wrapper (`app/wrappers/kie_wrapper.py`)

Wrapper unificado para acceder a múltiples modelos AI a través de Kie.ai:

**Modelos Soportados:**
- **Imagen**: Nano Banana Pro, Nano Banana 2, Flux-2, Google Imagen, Ideogram, Recraft, Topaz
- **Video**: Kling, Sora2, Bytedance, Hailuo, Wan, Grok Imagine Video
- **Audio**: ElevenLabs (TTS, STT)
- **Chat**: Gemini 2.5 Flash, Gemini 2.5 Pro

**Patrón Asíncrono:**
```python
# 1. Crear tarea
task_id = await kie.create_task(
    model="nano-banana-pro",
    action="generate",
    params={"prompt": "...", "aspectRatio": "16:9"}
)

# 2. Polling automático
result = await kie.wait_for_completion(task_id)

# 3. Resultado
image_url = result["result"]["imageUrl"]
```

### 2. Nano Banana Pro Node (`app/services/node_executors.py`)

**Características:**
- 1 prompt de texto (requerido)
- Hasta 14 imágenes de entrada (opcionales)
- 2 modos: `generate` (text-to-image) y `edit` (image-to-image)
- Calidad: 1K (4 créditos), 2K (8 créditos), 4K (16 créditos)
- Aspect ratios: 16:9, 9:16, 4:3, 3:4

**Configuración del Nodo:**
```json
{
  "model": "nano-banana-pro",
  "prompt": "A futuristic cityscape",
  "negative_prompt": "blurry, low quality",
  "aspect_ratio": "16:9",
  "image_quality": "2K",
  "input_images": []  // URLs de nodos anteriores
}
```

### 3. API Endpoints Actualizados

**GET `/api/v1/nodes`** - Lista todos los nodos disponibles:
- `nano_banana_pro` - Nuevo nodo principal
- `gemini_image` - Legacy (compatibilidad)
- `luma_video` - Generación de video
- `text_transform`, `image_merge`, `approval`, `output`

### 4. Frontend Actualizado

**Componentes modificados:**
- `NodeTypes.tsx` - Soporte para nano_banana_pro
- `NodeConfigPanel.tsx` - Configuración específica con selector de modelo y calidad
- `pipeline_executor.py` - API keys para Kie

## Configuración

### Variables de Entorno

Agregar en `.env` del backend:

```bash
KIE_API_KEY=tu_api_key_aqui
```

Obtener API key en: https://kie.ai/api-key

### Costos (Créditos Kie.ai)

| Calidad | Créditos | Uso Recomendado |
|---------|----------|-----------------|
| 1K | 4 | Prototipos, thumbnails |
| 2K | 8 | Contenido social media |
| 4K | 16 | Producción, print |

## Ejemplo de Pipeline

```
[Input: Prompt] ──► [Nano Banana Pro] ──► [Approval] ──► [Output]
                      │
                      ├── image_1: [Referencia 1]
                      ├── image_2: [Referencia 2]
                      └── ... (hasta 14)
```

## Diferencias: Nano Banana Pro vs Pro 2

| Característica | Nano Banana Pro | Nano Banana 2 |
|----------------|-----------------|---------------|
| Input images | 14 máx | 14 máx |
| Calidad máx | 4K | 4K |
| Velocidad | ~30s | ~20s |
| Calidad visual | Muy buena | Excelente |
| Costo | Estándar | +20% |

## Próximos Pasos (Weavy.ai Style)

Para replicar la experiencia Weavy.ai:

1. **Webhooks** - Notificaciones automáticas cuando un job completa
2. **AI Agents** - @mentions en comentarios para activar generación
3. **Knowledge Base** - Subir documentos como referencia para los prompts
4. **Visual Builder Mejorado** - Drag & drop de integraciones
5. **Template Gallery** - Pipelines pre-construidos por caso de uso

## Links de Referencia

- Kie.ai Docs: https://docs.kie.ai/
- Nano Banana Pro: https://nanophoto.ai/docs/api/nano-banana-pro
- Weavy.ai: https://weavy.com/docs
