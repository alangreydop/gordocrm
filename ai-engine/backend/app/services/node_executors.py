"""Ejecutores específicos para cada tipo de nodo."""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from ..wrappers.gemini_wrapper import GeminiWrapper, GeminiAPIError
from ..wrappers.kie_wrapper import KieWrapper, KieAPIError

logger = logging.getLogger(__name__)


class NodeExecutorError(Exception):
    """Error base para ejecutores de nodos."""

    pass


class GeminiImageExecutor:
    """Ejecuta generación de imágenes con Nano Banana Pro/Pro 2 via Kie.ai."""

    def __init__(self, api_key: Optional[str] = None):
        try:
            self.wrapper = KieWrapper(api_key)
        except ValueError as e:
            raise NodeExecutorError(f"Kie.ai API no configurada: {e}")

    async def execute(self, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ejecuta generación/edición de imágenes con Nano Banana Pro/Pro 2.

        Soporta:
        - 1 prompt de texto
        - Hasta 14 imágenes de entrada (referencias)

        Args:
            config: Configuración del nodo
            input_data: Datos de entrada con prompt e imágenes

        Returns:
            Dict con results: lista de imágenes generadas
        """
        try:
            prompt = input_data.get('prompt') or config.get('prompt', '')
            if not prompt:
                raise NodeExecutorError("Prompt es requerido para generación de imágenes")

            # Extraer imágenes de entrada (hasta 14)
            input_images = self._extract_input_images(input_data, config)

            # Determinar modo y modelo
            model = config.get('model', 'nano-banana-pro')
            mode = 'edit' if input_images else 'generate'
            aspect_ratio = config.get('aspect_ratio', '16:9')
            image_quality = config.get('image_quality', '1K')

            logger.info(
                f"Generando imagen con {model}, modo: {mode}, "
                f"prompt: {prompt[:100]}..., imágenes input: {len(input_images)}"
            )

            result = await self.wrapper.generate_image(
                model=model,
                prompt=prompt,
                negative_prompt=config.get('negative_prompt'),
                aspect_ratio=aspect_ratio,
                image_quality=image_quality,
                input_images=input_images if input_images else None,
                mode=mode,
            )

            logger.info(f"Imagen generada exitosamente: {result['image_url']}")

            return {
                "type": "image",
                "status": "completed",
                "results": [{
                    "image_url": result['image_url'],
                    "task_id": result['task_id'],
                    "model": model,
                    "mode": mode,
                }],
                "metadata": result.get('metadata', {}),
                "completed_at": datetime.utcnow().isoformat(),
            }

        except KieAPIError as e:
            logger.exception(f"Error en Kie.ai API: {e}")
            raise NodeExecutorError(f"Kie.ai API error: {str(e)}")
        except Exception as e:
            logger.exception(f"Error inesperado en GeminiImageExecutor: {e}")
            raise NodeExecutorError(f"Error generando imagen: {str(e)}")

    def _extract_input_images(
        self,
        input_data: Dict[str, Any],
        config: Dict[str, Any],
    ) -> List[str]:
        """Extrae URLs de imágenes de entrada (máximo 14)."""
        images = []

        # Imágenes fijas en config
        config_images = config.get('input_images', [])
        if isinstance(config_images, list):
            images.extend(config_images)

        # Imágenes desde nodos anteriores
        for key, value in input_data.items():
            if isinstance(value, dict):
                if value.get('type') == 'image':
                    for result in value.get('results', []):
                        if isinstance(result, dict) and result.get('image_url'):
                            images.append(result['image_url'])
                        elif isinstance(result, str):
                            images.append(result)
                elif value.get('type') == 'video' and value.get('result', {}).get('thumbnail_url'):
                    images.append(value['result']['thumbnail_url'])

        return images[:14]


class KlingVideoExecutor:
    """Ejecuta generación de video con Kling via Kie.ai."""

    def __init__(self, api_key: Optional[str] = None):
        try:
            self.wrapper = KieWrapper(api_key)
        except ValueError as e:
            raise NodeExecutorError(f"Kie.ai API no configurada: {e}")

    async def execute(self, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ejecuta la generación de video con Kling/Sora2.

        Args:
            config: Configuración del nodo
            input_data: Datos de entrada

        Returns:
            Dict con result: video generado
        """
        try:
            prompt = input_data.get('prompt') or config.get('prompt', '')
            if not prompt:
                raise NodeExecutorError("Prompt es requerido para generación de video")

            # Extraer imagen de referencia si existe
            image_url = None
            for key, value in input_data.items():
                if isinstance(value, dict):
                    if value.get('type') == 'image':
                        for result in value.get('results', []):
                            if isinstance(result, dict) and result.get('image_url'):
                                image_url = result['image_url']
                                break
                    elif value.get('type') == 'video' and value.get('result', {}).get('thumbnail_url'):
                        image_url = value['result']['thumbnail_url']

            model = config.get('model', 'kling')
            duration = config.get('duration', 5)
            aspect_ratio = config.get('aspect_ratio', '16:9')

            logger.info(f"Generando video con {model}, prompt: {prompt[:100]}..., image_url: {image_url is not None}")

            result = await self.wrapper.generate_video(
                model=model,
                prompt=prompt,
                image_url=image_url,
                duration=duration,
                aspect_ratio=aspect_ratio,
            )

            logger.info(f"Video generado exitosamente: {result['video_url']}")

            return {
                "type": "video",
                "status": "completed",
                "results": [{
                    "video_url": result['video_url'],
                    "task_id": result['task_id'],
                    "model": model,
                    "duration": duration,
                }],
                "metadata": result.get('metadata', {}),
                "completed_at": datetime.utcnow().isoformat(),
            }

        except KieAPIError as e:
            logger.exception(f"Error en Kie.ai API: {e}")
            raise NodeExecutorError(f"Kie.ai API error: {str(e)}")
        except Exception as e:
            logger.exception(f"Error inesperado en KlingVideoExecutor: {e}")
            raise NodeExecutorError(f"Error generando video: {str(e)}")


class TextTransformExecutor:
    """Ejecuta transformación de texto usando templates."""

    async def execute(self, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Aplica transformación de texto.

        Args:
            config: Configuración con template o llm_prompt
            input_data: Datos de entrada con variables

        Returns:
            Dict con result: texto transformado
        """
        template = config.get('template', '')
        llm_prompt = config.get('llm_prompt')

        try:
            if template:
                # Aplicar template simple con format
                result = template.format(**input_data)
            elif llm_prompt:
                # TODO: Implementar llamada a LLM para transformación
                result = input_data.get('text', '')
                logger.warning("llm_prompt configurado pero no implementado aún")
            else:
                # Sin transformación, pasar input
                result = input_data.get('text', '')

            logger.info(f"Texto transformado exitosamente ({len(result)} chars)")

            return {
                "type": "text",
                "status": "completed",
                "result": result,
                "completed_at": datetime.utcnow().isoformat(),
            }

        except KeyError as e:
            raise NodeExecutorError(f"Variable de template no encontrada: {e}")
        except Exception as e:
            logger.exception(f"Error en TextTransformExecutor: {e}")
            raise NodeExecutorError(f"Error transformando texto: {str(e)}")


class ImageMergeExecutor:
    """Combina múltiples imágenes en una composición."""

    async def execute(self, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Combina imágenes.

        Args:
            config: Configuración con layout, background_color, spacing
            input_data: Lista de imágenes de entrada

        Returns:
            Dict con merged: URL de imagen combinada
        """
        layout = config.get('layout', 'grid')
        background_color = config.get('background_color', '#000000')
        spacing = config.get('spacing', 10)

        # Extraer imágenes de input_data
        images = []
        for key, value in input_data.items():
            if key.endswith('_output') and isinstance(value, dict):
                if value.get('type') == 'image':
                    results = value.get('results', [])
                    images.extend([r.get('image_url') for r in results if r.get('image_url')])
                elif value.get('type') == 'video':
                    pass  # Skip videos

        if not images:
            raise NodeExecutorError("No hay imágenes para combinar")

        logger.info(f"Combinando {len(images)} imágenes con layout {layout}")

        # TODO: Implementar merge real de imágenes
        # Por ahora retornamos la primera imagen como placeholder
        merged_url = images[0] if images else None

        return {
            "type": "image",
            "status": "completed",
            "merged": merged_url,
            "source_images": images,
            "layout": layout,
            "completed_at": datetime.utcnow().isoformat(),
        }


class ApprovalExecutor:
    """Maneja puntos de aprobación humana."""

    async def execute(self, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepara datos para aprobación humana.

        Este executor no completa la aprobación - solo prepara los datos
        y señala que el pipeline debe pausar.

        Returns:
            Dict con status: waiting_approval
        """
        instruction = config.get('instruction', 'Aprobar este paso del pipeline')
        required_role = config.get('required_role', 'any')

        logger.info(f"Preparando aprobación: {instruction}")

        # Extraer preview data del input
        preview_data = {}
        for key, value in input_data.items():
            if isinstance(value, dict):
                # Extraer URLs de imágenes/videos para preview
                if value.get('type') == 'image':
                    preview_data[key] = value.get('results', [])
                elif value.get('type') == 'video':
                    preview_data[key] = value.get('result')
                else:
                    preview_data[key] = value
            else:
                preview_data[key] = value

        return {
            "type": "approval",
            "status": "waiting_approval",
            "instruction": instruction,
            "required_role": required_role,
            "preview_data": preview_data,
            "created_at": datetime.utcnow().isoformat(),
        }


class OutputExecutor:
    """Maneja la entrega de resultados finales."""

    async def execute(self, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepara resultados para entrega.

        Args:
            config: Configuración con delivery_method, webhook_url, etc.
            input_data: Resultados a entregar

        Returns:
            Dict con delivery status
        """
        delivery_method = config.get('delivery_method', 'download')
        webhook_url = config.get('webhook_url')
        email_recipients = config.get('email_recipients', [])

        logger.info(f"Preparando entrega via {delivery_method}")

        # Recopilar todos los resultados
        outputs = {}
        for key, value in input_data.items():
            outputs[key] = value

        # TODO: Implementar envío real según método
        if delivery_method == 'webhook' and webhook_url:
            # TODO: Enviar webhook
            logger.info(f"Webhook pendiente de implementación: {webhook_url}")

        if delivery_method == 'email' and email_recipients:
            # TODO: Enviar email
            logger.info(f"Email pendiente de implementación: {email_recipients}")

        return {
            "type": "output",
            "status": "delivered",
            "delivery_method": delivery_method,
            "outputs": outputs,
            "delivered_at": datetime.utcnow().isoformat(),
        }


# Factory para obtener ejecutores
EXECUTOR_MAP = {
    'gemini_image': GeminiImageExecutor,  # Legacy
    'nano_banana_pro': GeminiImageExecutor,  # Usa Kie.ai
    'kling_video': KlingVideoExecutor,  # Usa Kie.ai
    'text_transform': TextTransformExecutor,
    'image_merge': ImageMergeExecutor,
    'approval': ApprovalExecutor,
    'output': OutputExecutor,
}


def get_executor(node_type: str, api_keys: Optional[Dict[str, str]] = None):
    """
    Factory para obtener el executor correcto.

    Args:
        node_type: Tipo de nodo (gemini_image, nano_banana_pro, kling_video, etc.)
        api_keys: Diccionario con API keys opcionales

    Returns:
        Instancia del executor correspondiente
    """
    executor_class = EXECUTOR_MAP.get(node_type)
    if not executor_class:
        raise NodeExecutorError(f"Tipo de nodo no implementado: {node_type}")

    # Pasar API keys si corresponde
    api_keys = api_keys or {}
    if node_type in ['gemini_image', 'nano_banana_pro', 'kling_video']:
        # Usar Kie.ai API key
        return executor_class(api_key=api_keys.get('kie'))
    else:
        return executor_class()
